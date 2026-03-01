import React, { useState, useEffect } from 'react';
import { App, Form, Input, Select, InputNumber, Button, Card, Row, Col, Table, Statistic, List, Typography, Switch, Space, Checkbox, Dropdown, Tag, Flex, Segmented } from 'antd';
import axios from 'axios';
import { pinyin } from 'pinyin-pro';
import { PlusOutlined, DeleteOutlined, UpOutlined, DownOutlined } from '@ant-design/icons';

const { TextArea } = Input;
const { Title, Text } = Typography;
const API_BASE = import.meta.env.DEV ? '/api' : '';
const REPO_RECORDS_STORAGE_KEY = 'repo_records_v1';
const SPECIAL_ACCOUNT_KEYWORDS = ['单一', '集合', '资产管理产品', '信托计划', '资产管理计划'];

const Recommendation = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const selectedPortfolio = Form.useWatch('portfolio', form);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [useImported, setUseImported] = useState(true);
  const [portfolios, setPortfolios] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [positionsForDisplay, setPositionsForDisplay] = useState([]);
  const [selectedInstitutions, setSelectedInstitutions] = useState([]);
  const [bondOverrides, setBondOverrides] = useState({});
  const [instSortOrder, setInstSortOrder] = useState(null);
  const [repoCollapsed, setRepoCollapsed] = useState(false);
  const [repoArrangeResult, setRepoArrangeResult] = useState([]);
  const [repoRecords, setRepoRecords] = useState(() => ([
    {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      portfolio: undefined,
      counterparty: undefined,
      tradeYi: undefined,
      pricePct: undefined,
      termD: undefined,
      pledgeText: '',
      pledgeBonds: [],
    }
  ]));
  const [holdingsByPortfolio, setHoldingsByPortfolio] = useState({});
  const [accountTypeTouched, setAccountTypeTouched] = useState(false);
  const [holdingCopyFormat, setHoldingCopyFormat] = useState('code_name');

  useEffect(() => {
    const fetchPortfolios = async () => {
      try {
        const res = await axios.get(`${API_BASE}/positions/portfolios`);
        setPortfolios(res.data);
      } catch (error) {
        console.error('Failed to fetch portfolios');
      }
    };

    const fetchInstitutions = async () => {
      try {
        const res = await axios.get(`${API_BASE}/institutions`);
        setInstitutions((res.data || []).map((i) => i.name).filter(Boolean));
      } catch (error) {
        console.error('Failed to fetch institutions');
      }
    };
    fetchPortfolios();
    fetchInstitutions();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REPO_RECORDS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        setRepoRecords(parsed.map((r) => ({
          id: r.id || `${Date.now()}_${Math.random().toString(16).slice(2)}`,
          portfolio: r.portfolio,
          counterparty: r.counterparty,
          tradeYi: r.tradeYi,
          pricePct: r.pricePct,
          termD: r.termD,
          pledgeText: r.pledgeText || '',
          pledgeBonds: Array.isArray(r.pledgeBonds) ? r.pledgeBonds : [],
        })));
      }
    } catch {}
  }, []);

  useEffect(() => {
    const selectedPortfolios = Array.from(new Set(repoRecords.map((r) => r.portfolio).filter(Boolean)));
    selectedPortfolios.forEach((p) => {
      const cache = holdingsByPortfolio[p];
      if (!cache || (!cache.loaded && !cache.loading)) {
        loadHoldings(p);
      }
    });
  }, [repoRecords]);

  useEffect(() => {
    if (!useImported || accountTypeTouched || !selectedPortfolio) return;
    const isSpecial = SPECIAL_ACCOUNT_KEYWORDS.some((kw) => String(selectedPortfolio || '').includes(kw));
    const nextType = isSpecial ? '专户' : '公募';
    form.setFieldsValue({ accountType: nextType });
  }, [useImported, selectedPortfolio, accountTypeTouched, form]);

  const normalizeBondName = (name) => {
    return String(name || '')
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .trim();
  };

  const parseBondsFromText = (input) => {
    const excludeKeywords = ['\u884c\u4e8c\u7ea7', '\u56fd\u5f00', '\u519c\u53d1', '\u8fdb\u51fa', '\u56fd\u503a', 'CD'];
    const statusKeywords = ['\u901a\u8fc7', '\u53ef\u62bc', '\u53ef\u8d28\u62bc'];
    const isValidBondToken = (token) => {
      const text = String(token || '').trim();
      if (!text) return false;
      if (!/^\d/.test(text)) return false;
      if (!/[\u4e00-\u9fff]/.test(text)) return false;
      if (/^\d+$/.test(text)) return false;
      if (/^[\u4e00-\u9fff]+$/.test(text)) return false;
      if (text.includes('.')) return false;
      return true;
    };

    const tokens = String(input || '').trim().split(/\s+/g);
    const out = [];
    const seen = new Set();
    for (let token of tokens) {
      if (!token) continue;
      if (!isValidBondToken(token)) continue;
      if (statusKeywords.includes(token)) continue;
      for (const kw of statusKeywords) {
        if (token.endsWith(kw)) {
          token = token.slice(0, -kw.length);
          break;
        }
      }
      if (!isValidBondToken(token)) continue;
      if (excludeKeywords.some((kw) => token.includes(kw))) continue;
      if (seen.has(token)) continue;
      seen.add(token);
      out.push(token);
    }
    return out;
  };

  const matchInstitutionOption = (input, option) => {
    const raw = String(option?.label || option?.value || '');
    const keyword = String(input || '').trim().toLowerCase();
    if (!keyword) return true;
    const initials = pinyin(raw, { pattern: 'first', toneType: 'none' }).replace(/\s+/g, '').toLowerCase();
    return raw.includes(input) || raw.toLowerCase().includes(keyword) || initials.includes(keyword);
  };

  const loadHoldings = async (portfolio) => {
    if (!portfolio) return;
    setHoldingsByPortfolio((prev) => ({
      ...prev,
      [portfolio]: { ...(prev[portfolio] || {}), loading: true, loaded: false }
    }));

    try {
      const res = await axios.get(`${API_BASE}/positions`, { params: { portfolio } });
      const list = Array.isArray(res.data) ? res.data : [];
      const byName = {};
      const byNormName = {};
      list.forEach((p) => {
        const bondName = p.bond_name;
        if (!bondName) return;
        const item = {
          code: p.bond_code,
          name: bondName,
          amount: Number(p.amount || 0),
        };
        byName[bondName] = item;
        byNormName[normalizeBondName(bondName)] = item;
      });
      setHoldingsByPortfolio((prev) => ({
        ...prev,
        [portfolio]: { loading: false, loaded: true, byName, byNormName }
      }));
    } catch (e) {
      setHoldingsByPortfolio((prev) => ({
        ...prev,
        [portfolio]: { ...(prev[portfolio] || {}), loading: false, loaded: false }
      }));
    }
  };

  const updateRepoRecord = (id, patch) => {
    setRepoRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addRepoRecord = () => {
    setRepoRecords((prev) => ([
      ...prev,
      {
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        portfolio: undefined,
        counterparty: undefined,
        tradeYi: undefined,
        pricePct: undefined,
        termD: undefined,
        pledgeText: '',
        pledgeBonds: [],
      }
    ]));
  };

  const removeRepoRecord = (id) => {
    setRepoRecords((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((r) => r.id !== id);
    });
  };

  const saveRepoRecords = () => {
    try {
      localStorage.setItem(REPO_RECORDS_STORAGE_KEY, JSON.stringify(repoRecords));
      message.success('回购交易记录已保存');
    } catch {
      message.error('保存失败');
    }
  };

  const clearRepoRecords = () => {
    try {
      localStorage.removeItem(REPO_RECORDS_STORAGE_KEY);
    } catch {}
    setRepoRecords([
      {
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        portfolio: undefined,
        counterparty: undefined,
        tradeYi: undefined,
        pricePct: undefined,
        termD: undefined,
        pledgeText: '',
        pledgeBonds: [],
      }
    ]);
    setRepoArrangeResult([]);
    message.success('回购交易记录已清除');
  };

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const payload = {
        account_type: values.accountType,
        source_type: values.sourceType,
        n_rec: values.nRec,
      };

      let positionsToDisplay = [];
      if (useImported) {
        payload.portfolio = values.portfolio;
        const posRes = await axios.get(`${API_BASE}/positions`, {
          params: { portfolio: values.portfolio }
        });
        positionsToDisplay = (posRes.data || []).map((p) => ({
          name: p.bond_name,
          code: p.bond_code,
          amount: p.amount,
        }));
      } else {
        // 解析持仓
        const parseRes = await axios.post(`${API_BASE}/positions/parse`, {
          text: values.positionText
        });
        payload.positions = (parseRes.data || []).filter((p) => Number(p.amount) > 0);
        positionsToDisplay = payload.positions || [];
      }

      const positionsNonZero = (positionsToDisplay || []).filter((p) => Number(p.amount) > 0);
      setPositionsForDisplay(positionsNonZero);
      setSelectedInstitutions([]);
      setBondOverrides({});
      
      const recRes = await axios.post(`${API_BASE}/recommend`, payload);
      setResult(recRes.data);
    } catch (error) {
      message.error('计算推荐失败');
    } finally {
      setLoading(false);
    }
  };

  const copySelectedPortfolioHoldings = async ({ onlyAvailable = false, tradeVenue = null } = {}) => {
    if (!selectedPortfolio) {
      message.warning('请先选择组合');
      return;
    }

    try {
      const res = await axios.get(`${API_BASE}/positions`, {
        params: { portfolio: selectedPortfolio }
      });
      const list = Array.isArray(res.data) ? res.data : [];
      const lines = list
        .filter((item) => item?.bond_name)
        .filter((item) => (onlyAvailable ? Number(item?.amount || 0) !== 0 : true))
        .filter((item) => (tradeVenue ? String(item?.trade_venue || '').trim() === tradeVenue : true))
        .map((item) => {
          const code = String(item.bond_code || '').trim();
          const name = String(item.bond_name || '').trim();
          if (holdingCopyFormat === 'code_only') return code;
          return `${code} ${name}`.trim();
        })
        .filter(Boolean);

      if (!lines.length) {
        if (tradeVenue) {
          message.warning(`当前组合无可复制的${tradeVenue}可用持仓`);
        } else {
          message.warning(onlyAvailable ? '当前组合无可复制的可用持仓' : '当前组合无可复制持仓');
        }
        return;
      }

      await navigator.clipboard.writeText(lines.join('\n'));
      if (tradeVenue) {
        message.success(`已复制 ${lines.length} 条${tradeVenue}可用持仓`);
      } else {
        message.success(`已复制 ${lines.length} 条${onlyAvailable ? '可用持仓' : '全部持仓'}`);
      }
    } catch (error) {
      message.error(error?.response?.data?.detail || '复制持仓失败');
    }
  };

  const posMap = positionsForDisplay.reduce((acc, item) => {
    acc[item.name] = item.amount;
    return acc;
  }, {});

  const codeMap = positionsForDisplay.reduce((acc, item) => {
    if (item.code) {
      acc[item.name] = item.code;
    }
    return acc;
  }, {});

  const matrixRaw = Array.isArray(result?.recommendation_matrix) ? result.recommendation_matrix : [];
  const matrixRows = matrixRaw.filter((row) => row?.bond_name && row.bond_name !== '可质押债券只数');
  const matrixDisplayRows = matrixRows.filter((row) => Number(posMap[row.bond_name] || 0) > 0);

  const institutionKeys = (() => {
    const keys = new Set();
    const excluded = new Set(['bond_name', '可接受质押机构数']);
    matrixDisplayRows.forEach((row) => {
      Object.keys(row).forEach((k) => {
        if (!excluded.has(k)) keys.add(k);
      });
    });
    return Array.from(keys);
  })();

  const getInstCount = (row) =>
    institutionKeys.reduce((cnt, inst) => cnt + (row?.[inst] === '可押' ? 1 : 0), 0);

  const sortedMatrixRows = (() => {
    const rows = [...matrixDisplayRows];
    if (instSortOrder) {
      rows.sort((a, b) => getInstCount(a) - getInstCount(b));
      if (instSortOrder === 'descend') rows.reverse();
      return rows;
    }
    rows.sort((a, b) => Number(posMap[b.bond_name] || 0) - Number(posMap[a.bond_name] || 0));
    return rows;
  })();

  const pledgeableBondsByInst = (() => {
    const map = {};
    institutionKeys.forEach((inst) => {
      map[inst] = [];
    });
    matrixDisplayRows.forEach((row) => {
      institutionKeys.forEach((inst) => {
        if (row[inst] === '可押') {
          map[inst].push(row.bond_name);
        }
      });
    });
    return map;
  })();

  const instTotalPledgeAmount = (() => {
    const totals = {};
    institutionKeys.forEach((inst) => {
      const bonds = pledgeableBondsByInst[inst] || [];
      totals[inst] = bonds.reduce((sum, bondName) => sum + Number(posMap[bondName] || 0), 0);
    });
    return totals;
  })();

  const autoSelectedBondsSet = (() => {
    const set = new Set();
    selectedInstitutions.forEach((inst) => {
      (pledgeableBondsByInst[inst] || []).forEach((bondName) => set.add(bondName));
    });
    return set;
  })();

  const isBondSelected = (bondName) => {
    if (bondOverrides[bondName] === true) return true;
    if (bondOverrides[bondName] === false) return false;
    return autoSelectedBondsSet.has(bondName);
  };

  const selectedBondsTotalAmount = matrixDisplayRows.reduce((sum, row) => {
    if (!isBondSelected(row.bond_name)) return sum;
    return sum + Number(posMap[row.bond_name] || 0);
  }, 0);

  const coveredAmountByInstitutions = Array.from(autoSelectedBondsSet).reduce((sum, bondName) => {
    return sum + Number(posMap[bondName] || 0);
  }, 0);

  const inferBondCode = (bondName) => {
    const name = String(bondName || '').trim();
    if (!name) return '';
    const firstToken = name.split(/\s+/)[0];
    return firstToken.split(/[（(]/)[0];
  };

  const formatAmount = (val) => {
    return Number(val || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const handleBondToggle = (bondName, checked) => {
    const autoChecked = autoSelectedBondsSet.has(bondName);
    setBondOverrides((prev) => {
      const next = { ...prev };
      if (checked === autoChecked) {
        delete next[bondName];
      } else {
        next[bondName] = checked;
      }
      return next;
    });
  };

  const handleInstitutionToggle = (inst, checked) => {
    setSelectedInstitutions((prev) => {
      if (checked) return Array.from(new Set([...prev, inst]));
      return prev.filter((x) => x !== inst);
    });
  };

  const copyPledgeableBonds = async (inst) => {
    const lines = matrixDisplayRows
      .filter((row) => row[inst] === '可押')
      .map((row) => {
        const bondName = row.bond_name;
        const code = codeMap[bondName] || inferBondCode(bondName);
        return `${code} ${bondName}`;
      });

    const text = lines.join('\n');
    if (!text) {
      message.warning('当前机构无可复制的可押债券');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      message.success('已复制到剪贴板');
    } catch (e) {
      message.error('复制失败，请检查浏览器权限');
    }
  };

  const smartArrangeRepoBonds = async () => {
    const records = Array.isArray(repoRecords) ? repoRecords : [];
    const validRecords = records.filter((r) => r?.portfolio && Number(r?.tradeYi || 0) > 0);
    if (!validRecords.length) {
      message.warning('请先完善回购交易记录（组合、交易量）');
      return;
    }

    try {
      setLoading(true);
      const res = await axios.post(`${API_BASE}/repo/arrange`, { records });
      const items = res?.data?.items || [];
      setRepoArrangeResult(items);
      const failedCount = Number(res?.data?.failed_count || 0);
      if (failedCount > 0) {
        message.warning(`智能排券完成，${failedCount} 笔交易未满足90%覆盖约束`);
      } else {
        message.success('智能排券完成');
      }
    } catch (error) {
      message.error(error?.response?.data?.detail || '智能排券失败');
    } finally {
      setLoading(false);
    }
  };

  const repoComputed = (() => {
    const cum = {};
    return repoRecords.map((r) => {
      const portfolio = r.portfolio;
      const cache = portfolio ? holdingsByPortfolio[portfolio] : null;
      const byName = cache?.byName || {};
      const byNormName = cache?.byNormName || {};

      const tradeYi = Number(r.tradeYi || 0);
      const tradeWan = tradeYi * 10000;

      const pledged = Array.from(new Set(Array.isArray(r.pledgeBonds) ? r.pledgeBonds : []));
      let singleCoverageWan = 0;
      const missingBonds = [];
      const matchedHoldingKeys = [];

      pledged.forEach((bondName) => {
        const direct = byName[bondName];
        const norm = byNormName[normalizeBondName(bondName)];
        const item = direct || norm;
        const amt = Number(item?.amount || 0);
        if (amt > 0) {
          singleCoverageWan += amt;
          matchedHoldingKeys.push(item.name);
        } else {
          missingBonds.push(bondName);
        }
      });

      const singleOk = tradeWan > 0 ? (singleCoverageWan * 0.9 >= tradeWan) : false;

      if (portfolio && !cum[portfolio]) {
        cum[portfolio] = { tradeWan: 0, coverageWan: 0, used: new Set() };
      }

      const cumEntry = portfolio ? cum[portfolio] : null;
      let cumTradeWan = 0;
      let cumCoverageWan = 0;
      let cumOk = false;
      let singleCapWan = 0;
      let cumCapWan = 0;
      let currentCapWan = 0;

      if (cumEntry) {
        const cumTradeWanBefore = cumEntry.tradeWan;
        matchedHoldingKeys.forEach((k) => {
          if (cumEntry.used.has(k)) return;
          cumEntry.used.add(k);
          const amt = Number(byName[k]?.amount || 0);
          if (amt > 0) cumEntry.coverageWan += amt;
        });

        cumCoverageWan = cumEntry.coverageWan;
        singleCapWan = singleCoverageWan * 0.9;
        cumCapWan = cumCoverageWan * 0.9;
        currentCapWan = Math.max(0, Math.min(singleCapWan, cumCapWan - cumTradeWanBefore));

        cumEntry.tradeWan += tradeWan;
        cumTradeWan = cumEntry.tradeWan;
        cumOk = cumTradeWan > 0 ? (cumCapWan >= cumTradeWan) : false;
      }

      const ok = singleOk && cumOk;
      return {
        ...r,
        tradeWan,
        singleCoverageWan,
        cumTradeWan,
        cumCoverageWan,
        singleCapWan,
        cumCapWan,
        currentCapWan,
        ok,
        missingBonds,
        cacheLoaded: Boolean(cache?.loaded),
      };
    });
  })();

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Title level={3}>智能推荐分析</Title>
      
      <Row gutter={24}>
        <Col span={8}>
          <Card title="参数设置" variant="outlined">
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                accountType: '公募',
                sourceType: 'mixed',
                nRec: 3,
                positionText: "25中交二航MTN001（科创票据） 15000\n24吉利汽车MTN001 14000"
              }}
              onFinish={onFinish}
            >
              <Form.Item label="数据源" name="sourceType">
                <Select options={[
                  {value: 'deal', label: '成交矩阵'},
                  {value: 'manual', label: '手工矩阵'},
                  {value: 'mixed', label: '混合矩阵 (推荐)'}
                ]} />
              </Form.Item>
              
              <Form.Item label="推荐机构数" name="nRec">
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item label="使用已导入持仓">
                <Switch checked={useImported} onChange={setUseImported} />
                <span style={{ marginLeft: 8, color: '#999', fontSize: '12px' }}>
                  开启后将使用“可用持仓管理”中导入的数据
                </span>
              </Form.Item>
              
              {useImported ? (
                <Form.Item label="选择组合">
                  <Space.Compact style={{ width: '100%' }}>
                    <Form.Item
                      name="portfolio"
                      rules={[{ required: true, message: '请选择组合' }]}
                      noStyle
                    >
                      <Select
                        style={{ width: '100%' }}
                        placeholder="请选择组合"
                        options={portfolios.map(p => ({ label: p, value: p }))}
                      />
                    </Form.Item>
                  </Space.Compact>
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ marginRight: 8 }}>{'\u590d\u5236\u683c\u5f0f'}</Text>
                    <Segmented
                      size="middle"
                      value={holdingCopyFormat}
                      onChange={setHoldingCopyFormat}
                      options={[
                        { value: 'code_name', label: '\u4ee3\u7801+\u540d\u79f0' },
                        { value: 'code_only', label: '\u4ec5\u4ee3\u7801' },
                      ]}
                    />
                  </div>
                  <Flex wrap gap={8} style={{ marginTop: 8 }}>
                    <Button style={{ minWidth: 160 }} onClick={() => copySelectedPortfolioHoldings({ onlyAvailable: false })}>复制全部持仓</Button>
                    <Button style={{ minWidth: 160 }} onClick={() => copySelectedPortfolioHoldings({ onlyAvailable: true })}>复制可用持仓</Button>
                    <Button style={{ minWidth: 160 }} onClick={() => copySelectedPortfolioHoldings({ onlyAvailable: true, tradeVenue: '上清' })}>复制上清可用持仓</Button>
                    <Button style={{ minWidth: 160 }} onClick={() => copySelectedPortfolioHoldings({ onlyAvailable: true, tradeVenue: '中债' })}>复制中债可用持仓</Button>
                  </Flex>
                </Form.Item>
              ) : (
                <Form.Item label="持仓数据导入" name="positionText" tooltip="格式：债券名称 [空格/制表符] 金额">
                  <TextArea rows={6} placeholder="请粘贴持仓数据..." />
                </Form.Item>
              )}

              <Form.Item label="账户类型" name="accountType">
                <Select
                  options={[{value: '公募', label: '公募'}, {value: '专户', label: '专户'}]}
                  onChange={() => setAccountTypeTouched(true)}
                />
              </Form.Item>
              
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block>
                  开始智能分析
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>
        
        <Col span={16}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {result ? (
              <>
              <Card size="small">
                <Space size="large" wrap>
                  <Statistic title="累计覆盖金额" value={result.total_covered_val} suffix="万" precision={0} valueStyle={{ fontSize: 18 }} />
                  <Statistic title="持仓覆盖率" value={result.coverage_rate * 100} suffix="%" precision={1} valueStyle={{ color: '#3f8600', fontSize: 18 }} />
                </Space>
              </Card>

              <Card title="推荐机构组合" size="small" styles={{ body: { padding: 12 } }}>
                <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                  <List
                    dataSource={result.best_institutions}
                    renderItem={(item, index) => (
                      <List.Item key={item.name}>
                        <List.Item.Meta
                          title={<Text strong>{index + 1}. {item.name}</Text>}
                          description={`贡献覆盖金额: ${item.total_val} 万 | 覆盖债券数: ${item.bonds.length}`}
                        />
                      </List.Item>
                    )}
                  />
                </div>
              </Card>

              <Card title="推荐矩阵明细" size="small" styles={{ body: { padding: 0 } }}>
                <div style={{ padding: 8 }}>
                  <Space size="large" wrap>
                    <Statistic title="勾选债券总金额" value={selectedBondsTotalAmount} suffix="万" precision={0} />
                    <Statistic title="勾选机构累计覆盖金额" value={coveredAmountByInstitutions} suffix="万" precision={0} />
                    <Button
                      onClick={() => {
                        setSelectedInstitutions([]);
                        setBondOverrides({});
                      }}
                    >
                      清空勾选
                    </Button>
                  </Space>
                </div>
                <Table
                  rowKey={(record) => record.bond_name}
                  dataSource={sortedMatrixRows}
                  sticky
                  columns={[
                    {
                      title: '债券名称',
                      dataIndex: 'bond_name',
                      key: 'bond_name',
                      fixed: 'left',
                      width: 224,
                      render: (text) => {
                        const amount = posMap[text];
                        const checked = isBondSelected(text);
                        return (
                          <div style={{ lineHeight: 1.2 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Checkbox checked={checked} onChange={(e) => handleBondToggle(text, e.target.checked)} />
                              <div style={{ color: '#000' }}>{text || '-'}</div>
                            </div>
                            {typeof amount === 'number' ? (
                              <div style={{ color: '#999', fontSize: 12, paddingLeft: 22 }}>
                                {amount}
                              </div>
                            ) : null}
                          </div>
                        );
                      }
                    },
                    {
                      title: '可押家数',
                      dataIndex: '_pledgeable_inst_cnt',
                      key: '_pledgeable_inst_cnt',
                      width: 90,
                      fixed: 'left',
                      sorter: true,
                      sortOrder: instSortOrder,
                      render: (_, record) => {
                        const cnt = institutionKeys.filter((inst) => record?.[inst] === '可押').length;
                        return <span style={{ color: '#000' }}>{cnt}</span>;
                      }
                    },
                    ...institutionKeys.map((inst) => ({
                      title: (
                        <Dropdown
                          trigger={['contextMenu']}
                          menu={{
                            items: [{ key: 'copy', label: '复制可押债券' }],
                            onClick: () => copyPledgeableBonds(inst),
                          }}
                        >
                          <div style={{ userSelect: 'none', textAlign: 'center' }}>
                            <div>
                              <Checkbox
                                checked={selectedInstitutions.includes(inst)}
                                onChange={(e) => handleInstitutionToggle(inst, e.target.checked)}
                              />
                            </div>
                            <div>{inst}</div>
                            <div style={{ color: '#999', fontSize: 12 }}>
                              {formatAmount(instTotalPledgeAmount[inst])} 万
                            </div>
                          </div>
                        </Dropdown>
                      ),
                      dataIndex: inst,
                      key: inst,
                      width: 160,
                      render: (text) => (
                        <span style={{ color: text === '可押' ? '#52c41a' : '#ccc' }}>
                          {text || '-'}
                        </span>
                      )
                    }))
                  ]}
                  scroll={{ x: 'max-content', y: 420 }}
                  pagination={false}
                  size="small"
                  onChange={(_, __, sorter) => {
                    const s = Array.isArray(sorter) ? sorter[0] : sorter;
                    if (s?.field === '_pledgeable_inst_cnt') {
                      setInstSortOrder(s.order || null);
                    } else {
                      setInstSortOrder(null);
                    }
                  }}
                />
              </Card>
              </>
            ) : (
              <Card style={{ textAlign: 'center', paddingTop: 100, height: '100%' }}>
                <Text type="secondary">暂无数据，请在左侧输入持仓并点击分析</Text>
              </Card>
            )}

            <Card
              title="回购交易记录"
              extra={
                <Space>
                  <Button type="primary" onClick={smartArrangeRepoBonds}>智能排券</Button>
                  <Button onClick={saveRepoRecords}>保存数据</Button>
                  <Button danger onClick={clearRepoRecords}>清除数据</Button>
                  <Button icon={<PlusOutlined />} onClick={addRepoRecord}>
                    新增
                  </Button>
                  <Button
                    icon={repoCollapsed ? <DownOutlined /> : <UpOutlined />}
                    onClick={() => setRepoCollapsed((v) => !v)}
                  >
                    {repoCollapsed ? '展开' : '收起'}
                  </Button>
                </Space>
              }
            >
              {repoCollapsed ? null : (
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  {repoComputed.map((r, idx) => (
                    <Card
                      key={r.id}
                      size="small"
                      styles={{ body: { padding: 12 } }}
                      title={
                        <Space>
                          <Tag color={r.ok ? 'green' : 'red'}>
                            {r.ok ? '质押券充足' : '质押券不足'}
                          </Tag>
                          <Text type="secondary">第 {idx + 1} 笔</Text>
                        </Space>
                      }
                      extra={
                        <Button
                          icon={<DeleteOutlined />}
                          danger
                          disabled={repoRecords.length <= 1}
                          onClick={() => removeRepoRecord(r.id)}
                        />
                      }
                    >
                      <Row gutter={[12, 12]}>
                        <Col span={24}>
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ minWidth: 200 }}>
                              <div style={{ marginBottom: 6, color: '#666', fontSize: 12 }}>本方组合</div>
                              <Select
                                placeholder="选择组合"
                                value={r.portfolio}
                                options={portfolios.map((p) => ({ label: p, value: p }))}
                                onChange={(v) => updateRepoRecord(r.id, { portfolio: v })}
                                style={{ width: 200 }}
                                showSearch
                              />
                            </div>
                            <div style={{ minWidth: 180 }}>
                              <div style={{ marginBottom: 6, color: '#666', fontSize: 12 }}>对手方机构</div>
                              <Select
                                placeholder="选择机构"
                                value={r.counterparty}
                                options={institutions.map((p) => ({ label: p, value: p }))}
                                onChange={(v) => updateRepoRecord(r.id, { counterparty: v })}
                                style={{ width: 180 }}
                                showSearch
                                filterOption={matchInstitutionOption}
                              />
                            </div>
                            <div>
                              <div style={{ marginBottom: 6, color: '#666', fontSize: 12 }}>交易量(亿)</div>
                              <InputNumber
                                min={0}
                                value={r.tradeYi}
                                onChange={(v) => updateRepoRecord(r.id, { tradeYi: v })}
                                style={{ width: 78 }}
                              />
                            </div>
                            <div>
                              <div style={{ marginBottom: 6, color: '#666', fontSize: 12 }}>价格(%)</div>
                              <InputNumber
                                min={0}
                                max={100}
                                value={r.pricePct}
                                onChange={(v) => updateRepoRecord(r.id, { pricePct: v })}
                                style={{ width: 78 }}
                              />
                            </div>
                            <div>
                              <div style={{ marginBottom: 6, color: '#666', fontSize: 12 }}>期限(D)</div>
                              <InputNumber
                                min={0}
                                value={r.termD}
                                onChange={(v) => updateRepoRecord(r.id, { termD: v })}
                                style={{ width: 78 }}
                              />
                            </div>
                          </div>
                        </Col>
                        <Col span={24}>
                          <div style={{ marginBottom: 6, color: '#666', fontSize: 12 }}>质押券（粘贴文本自动识别）</div>
                          <TextArea
                            rows={3}
                            value={r.pledgeText}
                            onChange={(e) => {
                              const text = e.target.value;
                              const bonds = parseBondsFromText(text);
                              updateRepoRecord(r.id, { pledgeText: text, pledgeBonds: bonds });
                            }}
                            placeholder="粘贴质押券文本..."
                          />
                          <div style={{ marginTop: 8 }}>
                            <Space wrap>
                              {(r.pledgeBonds || []).map((b) => (
                                <Tag key={b}>{b}</Tag>
                              ))}
                            </Space>
                          </div>
                        </Col>
                        <Col span={24}>
                          <Space size="large" wrap>
                            <Text>
                              单笔覆盖金额：{(r.singleCoverageWan || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} 万
                            </Text>
                            <Text>
                              累计覆盖金额：{(r.cumCoverageWan || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} 万
                            </Text>
                            <Text>
                              累计融资上限：{(r.cumCapWan || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} 万
                            </Text>
                            <Text>
                              当前融资上限：{(r.currentCapWan || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} 万
                            </Text>
                            <Text type={r.cacheLoaded || !r.portfolio ? 'secondary' : 'warning'}>
                              {!r.portfolio ? '请选择组合以计算覆盖' : (r.cacheLoaded ? '' : '正在加载组合持仓...')}
                            </Text>
                          </Space>
                          {r.missingBonds?.length ? (
                            <div style={{ marginTop: 8 }}>
                              <Text type="danger">缺失或为0的质押券：{r.missingBonds.slice(0, 10).join('、')}{r.missingBonds.length > 10 ? '…' : ''}</Text>
                            </div>
                          ) : null}
                        </Col>
                      </Row>
                    </Card>
                  ))}
                </Space>
              )}
            </Card>

            <Card title="回购交易要素">
              {!repoArrangeResult.length ? (
                <Text type="secondary">点击“智能排券”后在此查看结果（不回填原记录）</Text>
              ) : (
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  {repoArrangeResult.map((item) => (
                    <Card key={item.key} size="small" styles={{ body: { padding: 12 } }}>
                      <div>
                        {`质押券金额(万) ${Number(item.coveredRaw || 0).toLocaleString()} 约束阈值(万)（交易量/0.9）${Number(item.requiredRaw || 0).toLocaleString()} 占用机构数 ${item.occupiedInstCnt || 0} 校验结果（${item.ok ? '通过' : '不足'}）`}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        {`${item.portfolio || '-'} 借 ${item.termD ?? '-'}D ${item.pricePct ?? '-'}% ${item.tradeYi ?? '-'}亿 发 ${item.counterparty || '-'}`}
                      </div>
                      <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {item.text || '-'}
                      </div>
                    </Card>
                  ))}
                </Space>
              )}
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );
};

export default Recommendation;
