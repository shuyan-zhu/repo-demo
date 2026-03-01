import React, { useState, useEffect, useRef } from 'react';
import { App, Tabs, Button, Popconfirm, Space, Card, Form, Select, Input, Row, Col, Modal, Radio, Dropdown, Table } from 'antd';
import axios from 'axios';
import { pinyin } from 'pinyin-pro';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';

const { TextArea } = Input;
const API_BASE = import.meta.env.DEV ? '/api' : '';
const LAST_MANUAL_ACCOUNT_TYPE_KEY = 'manual_last_saved_account_type';

const ManualMaintenance = () => {
  const { message } = App.useApp();
  const [accountType, setAccountType] = useState(() => (
    localStorage.getItem(LAST_MANUAL_ACCOUNT_TYPE_KEY) || '公募'
  ));
  const [columnsRaw, setColumnsRaw] = useState([]);
  const [dataSource, setDataSource] = useState([]);
  const [loading, setLoading] = useState(false);
  const [institutions, setInstitutions] = useState([]);
  const [batchForm] = Form.useForm();
  const [cellModalOpen, setCellModalOpen] = useState(false);
  const [editingCell, setEditingCell] = useState(null);
  const [editingStatus, setEditingStatus] = useState('');
  const [highlightCells, setHighlightCells] = useState(new Set());
  const [pendingHighlights, setPendingHighlights] = useState([]);
  const pendingHighlightsRef = useRef([]);
  const [tableState, setTableState] = useState({
    current: 1,
    pageSize: 50,
    total: 0,
    sortBy: 'bond_name',
    sortOrder: 'asc',
  });
  const [exporting, setExporting] = useState(false);

  const getErrorMessage = (error, fallback) => error?.response?.data?.detail || fallback;
  const highlightDurationMs = 2500;
  const statusKeywords = ['通过', '可押', '可质押'];
  const excludeKeywords = ['行二级', '国开', '农发', '进出', '国债', 'CD'];

  const addHighlightCells = (keys) => {
    if (!keys || !keys.length) return;
    setHighlightCells(new Set(keys));
    setTimeout(() => setHighlightCells(new Set()), highlightDurationMs);
  };

  const setPendingHighlightsSafe = (items) => {
    pendingHighlightsRef.current = items || [];
    setPendingHighlights(items || []);
  };

  const normalizeBondName = (name) => {
    return String(name || '')
      .replace(/\s+/g, '')
      .replace(/[（(][^）)]*[）)]/g, '')
      .trim();
  };

  const parseBondsFromText = (input) => {
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

  const fetchInstitutions = async () => {
    try {
      const res = await axios.get(`${API_BASE}/institutions`);
      setInstitutions(res.data.map((i) => ({ label: i.name, value: i.name })));
    } catch (error) {
      message.error(getErrorMessage(error, '加载机构列表失败'));
    }
  };

  const fetchData = async (type = accountType, overrides = {}) => {
    const next = { ...tableState, ...overrides };
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/matrix`, {
        params: {
          account_type: type,
          source_type: 'manual',
          page: next.current,
          page_size: next.pageSize,
          sort_by: next.sortBy,
          sort_order: next.sortOrder,
        },
      });

      setColumnsRaw(res.data.columns || []);
      const nextRows = (res.data.dataSource || []).map((row) => ({
        ...row,
        _pledgeable_inst_cnt: Number(row?._pledgeable_inst_cnt || 0),
      }));
      setDataSource(nextRows);
      setTableState((prev) => ({
        ...prev,
        ...next,
        total: Number(res.data.total || 0),
      }));

      const pending = pendingHighlightsRef.current || [];
      if (pending.length) {
        const nextKeys = [];
        pending.forEach((item) => {
          const targetNorm = normalizeBondName(item.bondName);
          const row = nextRows.find((r) => normalizeBondName(r.bond_name) === targetNorm);
          if (row) {
            nextKeys.push(`${row.bond_name}::${item.institution}`);
          }
        });
        addHighlightCells(nextKeys);
        setPendingHighlightsSafe([]);
      }
    } catch (error) {
      message.error(getErrorMessage(error, '加载数据失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstitutions();
    fetchData(accountType, { current: 1 });
  }, [accountType]);

  const handleTableChange = (pagination, _filters, sorter) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    const allowedSortBy = ['bond_name', '_pledgeable_inst_cnt'];
    const nextSortBy = allowedSortBy.includes(s?.field) ? s.field : tableState.sortBy;
    const nextSortOrder = s?.order === 'ascend' ? 'asc' : s?.order === 'descend' ? 'desc' : tableState.sortOrder;

    fetchData(accountType, {
      current: pagination.current || 1,
      pageSize: pagination.pageSize || tableState.pageSize,
      sortBy: nextSortBy,
      sortOrder: nextSortOrder,
    });
  };

  const syncAccountType = (value) => {
    if (!value) return;
    setAccountType(value);
    batchForm.setFieldsValue({ accountType: value });
  };

  const onBatchFinish = async (values) => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/matrix/manual-batch`, {
        account_type: values.accountType,
        institution_name: values.institution,
        text: values.text,
      });
      if (res.data.status === 'success') {
        message.success(`成功识别并保存 ${res.data.count} 只债券`);
        localStorage.setItem(LAST_MANUAL_ACCOUNT_TYPE_KEY, values.accountType);
        const bonds = parseBondsFromText(values.text);
        setPendingHighlightsSafe(
          bonds.map((b) => ({ bondName: b, institution: String(values.institution || '').trim() }))
        );
        batchForm.resetFields();
        fetchData(accountType, { current: 1 });
      } else {
        message.error(res.data.message || '批量更新失败');
      }
    } catch (error) {
      message.error(getErrorMessage(error, '批量更新失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInstitution = async (instName) => {
    try {
      await axios.post(`${API_BASE}/matrix/delete-institution`, {
        account_type: accountType,
        institution_name: instName,
      });
      message.success('删除成功');
      fetchData(accountType);
    } catch (error) {
      message.error(getErrorMessage(error, '删除失败'));
    }
  };

  const openCellModal = (bondName, institutionName, currentStatus) => {
    setEditingCell({ bondName, institutionName });
    setEditingStatus(currentStatus === '可押' ? '可押' : '');
    setCellModalOpen(true);
  };

  const handleCellUpdate = async () => {
    if (!editingCell) return;
    try {
      await axios.post(`${API_BASE}/matrix/update`, {
        account_type: accountType,
        bond_name: editingCell.bondName,
        institution_name: editingCell.institutionName,
        status: editingStatus,
      });

      setDataSource((prev) =>
        prev.map((row) => {
          if (row.bond_name !== editingCell.bondName) return row;
          const nextRow = { ...row, [editingCell.institutionName]: editingStatus };
          const cnt = Object.keys(nextRow || {}).filter(
            (k) => !['bond_name', '_pledgeable_inst_cnt'].includes(k) && nextRow[k] === '可押'
          ).length;
          nextRow._pledgeable_inst_cnt = cnt;
          return nextRow;
        })
      );

      message.success('已同步');
      addHighlightCells([`${editingCell.bondName}::${editingCell.institutionName}`]);
      setCellModalOpen(false);
      setEditingCell(null);
    } catch (error) {
      message.error(getErrorMessage(error, '同步失败'));
    }
  };

  const handleDeleteBondRow = async (bondName) => {
    Modal.confirm({
      title: '确认删除该行？',
      content: `将删除债券“${bondName}”在当前账户类型下的全部手工准入记录。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await axios.post(`${API_BASE}/matrix/delete-bond`, {
            account_type: accountType,
            bond_name: bondName,
          });
          message.success('删除成功');
          fetchData(accountType);
        } catch (error) {
          message.error(getErrorMessage(error, '删除失败'));
        }
      },
    });
  };

  const escapeCsvCell = (value) => {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const downloadCsv = (filename, headers, rows) => {
    const lines = [];
    lines.push(headers.map(escapeCsvCell).join(','));
    rows.forEach((row) => {
      lines.push(row.map(escapeCsvCell).join(','));
    });
    const csv = `\ufeff${lines.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatExportDate = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}${m}${day}`;
  };

  const exportManualMatrixCsv = async () => {
    setExporting(true);
    try {
      const exportDate = formatExportDate();
      const types = ['公募', '专户'];
      for (const type of types) {
        const res = await axios.get(`${API_BASE}/matrix`, {
          params: {
            account_type: type,
            source_type: 'manual',
            sort_by: 'bond_name',
            sort_order: 'asc',
          },
        });
        const cols = res.data?.columns || [];
        const data = res.data?.dataSource || [];
        const headers = cols.map((c) => c.title || c.dataIndex);
        const keys = cols.map((c) => c.dataIndex);
        const rows = data.map((item) => keys.map((k) => item?.[k] ?? ''));
        const filename = `${type}手工准入矩阵${exportDate}.csv`;
        downloadCsv(filename, headers, rows);
      }
      message.success('导出成功');
    } catch (error) {
      message.error(getErrorMessage(error, '导出失败'));
    } finally {
      setExporting(false);
    }
  };

  const buildColumns = () => {
    const baseColumns = (columnsRaw || []).map((col) => {
      if (col.dataIndex === 'bond_name') {
        return {
          ...col,
          sorter: true,
          sortOrder: tableState.sortBy === 'bond_name' ? (tableState.sortOrder === 'asc' ? 'ascend' : 'descend') : null,
          render: (text, record) => {
            const items = [{ key: 'delete_row', label: '删除该行记录' }];
            return (
              <Dropdown
                trigger={['contextMenu']}
                menu={{ items, onClick: () => handleDeleteBondRow(record.bond_name) }}
              >
                <span style={{ color: '#000', cursor: 'context-menu' }}>{text || '-'}</span>
              </Dropdown>
            );
          },
        };
      }

      return {
        ...col,
        onCell: (record) => {
          const key = `${record.bond_name}::${col.dataIndex}`;
          const shouldHighlight = highlightCells.has(key) && record?.[col.dataIndex] === '可押';
          return shouldHighlight ? { style: { backgroundColor: '#fff7e6' } } : {};
        },
        render: (text, record) => (
          <span
            style={{
              color: text === '可押' ? '#52c41a' : '#ccc',
              cursor: 'pointer',
              borderRadius: 4,
              padding: '2px 4px',
            }}
            onDoubleClick={() => openCellModal(record.bond_name, col.dataIndex, text)}
          >
            {text || '-'}
          </span>
        ),
        title: (
          <Space>
            {col.title}
            <Popconfirm title="确定删除该机构列吗？" onConfirm={() => handleDeleteInstitution(col.title)}>
              <DeleteOutlined style={{ color: '#ff4d4f', cursor: 'pointer' }} />
            </Popconfirm>
          </Space>
        ),
      };
    });

    const bondColIndex = baseColumns.findIndex((c) => c.dataIndex === 'bond_name');
    if (bondColIndex >= 0) {
      baseColumns.splice(bondColIndex + 1, 0, {
        title: '可押家数',
        dataIndex: '_pledgeable_inst_cnt',
        key: '_pledgeable_inst_cnt',
        width: 90,
        fixed: 'left',
        sorter: true,
        sortOrder: tableState.sortBy === '_pledgeable_inst_cnt' ? (tableState.sortOrder === 'asc' ? 'ascend' : 'descend') : null,
        render: (_, record) => <span style={{ color: '#000' }}>{Number(record?._pledgeable_inst_cnt || 0)}</span>,
      });
    }

    return baseColumns;
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card title="快速识别与录入">
        <Form form={batchForm} layout="vertical" onFinish={onBatchFinish} initialValues={{ accountType }}>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label="账户类型" name="accountType" rules={[{ required: true }]}>
                <Select
                  options={[{ value: '公募', label: '公募' }, { value: '专户', label: '专户' }]}
                  onChange={syncAccountType}
                />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item label="选择机构" name="institution" rules={[{ required: true }]}>
                <Select
                  showSearch
                  options={institutions}
                  placeholder="搜索并选择机构"
                  filterOption={matchInstitutionOption}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="操作">
                <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={loading} block>
                  识别并保存
                </Button>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="粘贴债券文本" name="text" rules={[{ required: true }]}>
            <TextArea rows={4} placeholder="粘贴文本后自动识别债券名称" />
          </Form.Item>
        </Form>
      </Card>

      <Card
        title="手工准入矩阵明细"
        extra={
          <Button onClick={exportManualMatrixCsv} loading={exporting}>
            导出CSV
          </Button>
        }
      >
        <Tabs
          activeKey={accountType}
          onChange={syncAccountType}
          items={[
            { key: '公募', label: '公募' },
            { key: '专户', label: '专户' },
          ]}
        />

        <Table
          rowKey="bond_name"
          scroll={{ x: 'max-content' }}
          loading={loading}
          columns={buildColumns()}
          dataSource={dataSource}
          onChange={handleTableChange}
          pagination={{
            current: tableState.current,
            pageSize: tableState.pageSize,
            total: tableState.total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
          }}
          size="small"
        />
      </Card>

      <Modal
        title="修改状态"
        open={cellModalOpen}
        okText="确认"
        cancelText="取消"
        onOk={handleCellUpdate}
        onCancel={() => {
          setCellModalOpen(false);
          setEditingCell(null);
        }}
        destroyOnClose
      >
        <Radio.Group
          value={editingStatus}
          onChange={(e) => setEditingStatus(e.target.value)}
          options={[
            { label: '可押', value: '可押' },
            { label: '清空', value: '' },
          ]}
        />
      </Modal>
    </Space>
  );
};

export default ManualMaintenance;

