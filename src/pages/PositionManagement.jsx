import React, { useEffect, useState } from 'react';
import { App, Upload, Button, Table, Card, Space, Typography, Select, Modal, Form, Input, Segmented } from 'antd';
import { UploadOutlined, SettingOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title } = Typography;
const API_BASE = import.meta.env.DEV ? '/api' : '';
const LOCAL_MAPPING_KEY = 'positions_import_mapping';

const PositionManagement = () => {
  const { message } = App.useApp();
  const [dataSource, setDataSource] = useState([]);
  const [loading, setLoading] = useState(false);
  const [portfolios, setPortfolios] = useState([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState(null);
  const [isMappingModalVisible, setIsMappingModalVisible] = useState(false);
  const [mappingForm] = Form.useForm();
  const [importMode, setImportMode] = useState('append');
  const [fileList, setFileList] = useState([]);
  const [tableState, setTableState] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
    sortBy: 'imported_at',
    sortOrder: 'desc',
  });
  const [mappingInitial, setMappingInitial] = useState({
    portfolio: '资产名称',
    code: '证券代码',
    name: '证券名称',
    amount: '可用持仓(万元)',
    amount_unit: '万元',
  });

  const getErrorMessage = (error, fallback) => error?.response?.data?.detail || fallback;

  const fetchPortfolios = async () => {
    try {
      const res = await axios.get(`${API_BASE}/positions/portfolios`);
      setPortfolios(res.data);
    } catch {
      message.error('加载组合列表失败');
    }
  };

  const fetchData = async (portfolio = selectedPortfolio, overrides = {}) => {
    const next = { ...tableState, ...overrides };
    setLoading(true);
    try {
      const params = {
        page: next.current,
        page_size: next.pageSize,
        sort_by: next.sortBy,
        sort_order: next.sortOrder,
      };
      if (portfolio) params.portfolio = portfolio;

      const res = await axios.get(`${API_BASE}/positions`, { params });
      setDataSource(res.data || []);

      const totalFromHeader = Number(res.headers?.['x-total-count'] || 0);
      setTableState((prev) => ({
        ...prev,
        ...next,
        total: Number.isFinite(totalFromHeader) && totalFromHeader >= 0 ? totalFromHeader : (res.data || []).length,
      }));
    } catch (error) {
      message.error(getErrorMessage(error, '加载持仓数据失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolios();
    fetchData(null, { current: 1 });
    fetchMapping();
  }, []);

  const fetchMapping = async () => {
    const local = localStorage.getItem(LOCAL_MAPPING_KEY);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        setMappingInitial((prev) => ({ ...prev, ...parsed }));
        mappingForm.setFieldsValue({ ...mappingInitial, ...parsed });
      } catch {}
    }

    try {
      const res = await axios.get(`${API_BASE}/positions/mapping`);
      if (res.data?.mapping) {
        setMappingInitial((prev) => ({ ...prev, ...res.data.mapping }));
        mappingForm.setFieldsValue({ ...mappingInitial, ...res.data.mapping });
      } else {
        mappingForm.setFieldsValue(mappingInitial);
      }
    } catch {
      mappingForm.setFieldsValue(mappingInitial);
    }
  };

  const handlePortfolioChange = (value) => {
    setSelectedPortfolio(value || null);
    fetchData(value || null, { current: 1 });
  };

  const handleTableChange = (pagination, _filters, sorter) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    const allowedSortBy = ['imported_at', 'portfolio', 'bond_name', 'amount'];
    const nextSortBy = allowedSortBy.includes(s?.field) ? s.field : tableState.sortBy;
    const nextSortOrder = s?.order === 'ascend' ? 'asc' : s?.order === 'descend' ? 'desc' : tableState.sortOrder;

    fetchData(selectedPortfolio, {
      current: pagination.current || 1,
      pageSize: pagination.pageSize || tableState.pageSize,
      sortBy: nextSortBy,
      sortOrder: nextSortOrder,
    });
  };

  const uploadProps = {
    multiple: true,
    accept: '.xlsx,.xls',
    beforeUpload: () => false,
    fileList,
    onChange: ({ fileList: next }) => setFileList(next),
    showUploadList: true,
  };

  const doImport = async (mode) => {
    if (!fileList.length) {
      message.warning('请先选择要导入的 Excel 文件');
      return;
    }

    setLoading(true);
    try {
      const rawMapping = mappingForm.getFieldsValue(true);
      const mapping = {
        portfolio: rawMapping?.portfolio || mappingInitial.portfolio,
        code: rawMapping?.code || mappingInitial.code,
        name: rawMapping?.name || mappingInitial.name,
        amount: rawMapping?.amount || mappingInitial.amount,
        amount_unit: rawMapping?.amount_unit || mappingInitial.amount_unit,
      };
      const formData = new FormData();
      fileList.forEach((f) => {
        if (f.originFileObj) formData.append('files', f.originFileObj);
      });
      formData.append('mapping', JSON.stringify(mapping));
      formData.append('mode', mode);

      const res = await axios.post(`${API_BASE}/positions/import-batch`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      message.success(`导入成功：新增 ${res.data.inserted} 条，更新 ${res.data.updated} 条`);
      setFileList([]);
      fetchPortfolios();
      fetchData(selectedPortfolio, { current: 1 });
    } catch (error) {
      message.error(getErrorMessage(error, '导入失败，请检查文件格式或后端日志'));
    } finally {
      setLoading(false);
    }
  };

  const handleImportClick = async () => {
    if (importMode === 'overwrite') {
      Modal.confirm({
        title: '确认覆盖原有持仓？',
        content: '覆盖模式会先清空原有持仓后再导入本次文件。',
        okText: '确认覆盖并导入',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () => doImport('overwrite'),
      });
      return;
    }
    await doImport('append');
  };

  const columns = [
    { title: '组合', dataIndex: 'portfolio', key: 'portfolio', sorter: true },
    { title: '债券代码', dataIndex: 'bond_code', key: 'bond_code' },
    { title: '债券名称', dataIndex: 'bond_name', key: 'bond_name', sorter: true },
    { title: '交易场所', dataIndex: 'trade_venue', key: 'trade_venue' },
    {
      title: '可用持仓 (万元)',
      dataIndex: 'amount',
      key: 'amount',
      sorter: true,
      render: (val) => Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    },
    { title: '导入时间', dataIndex: 'imported_at', key: 'imported_at', sorter: true },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Title level={4}>持仓数据导入</Title>
          <Space>
            <Button icon={<SettingOutlined />} onClick={() => setIsMappingModalVisible(true)}>
              配置表头映射
            </Button>
            <Segmented
              value={importMode}
              onChange={setImportMode}
              options={[
                { label: '新增导入', value: 'append' },
                { label: '覆盖原有持仓', value: 'overwrite' },
              ]}
            />
            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />}>选择 Excel（可多选）</Button>
            </Upload>
            <Button type="primary" onClick={handleImportClick} loading={loading}>
              开始导入
            </Button>
          </Space>
        </Space>
      </Card>

      <Card
        title="持仓明细展示"
        extra={
          <Select
            placeholder="选择组合筛选"
            style={{ width: 250 }}
            allowClear
            onChange={handlePortfolioChange}
            options={portfolios.map((p) => ({ label: p, value: p }))}
          />
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={dataSource}
          onChange={handleTableChange}
          pagination={{
            current: tableState.current,
            pageSize: tableState.pageSize,
            total: tableState.total,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
          }}
        />
      </Card>

      <Modal
        title="Excel 表头映射配置"
        open={isMappingModalVisible}
        forceRender
        okText="保存"
        onOk={async () => {
          try {
            const values = await mappingForm.validateFields();
            await axios.post(`${API_BASE}/positions/mapping`, values);
            localStorage.setItem(LOCAL_MAPPING_KEY, JSON.stringify(values));
            setMappingInitial(values);
            message.success('映射配置已保存');
            setIsMappingModalVisible(false);
          } catch (error) {
            message.error(getErrorMessage(error, '保存失败，请检查填写内容'));
          }
        }}
        onCancel={() => setIsMappingModalVisible(false)}
      >
        <Form form={mappingForm} layout="vertical" initialValues={mappingInitial}>
          <Form.Item label="资产名称字段" name="portfolio" rules={[{ required: true }]}>
            <Input placeholder="例如：资产名称" />
          </Form.Item>
          <Form.Item label="证券代码字段" name="code">
            <Input placeholder="例如：证券代码" />
          </Form.Item>
          <Form.Item label="证券名称字段" name="name" rules={[{ required: true }]}>
            <Input placeholder="例如：证券名称" />
          </Form.Item>
          <Form.Item label="可用持仓字段" name="amount" rules={[{ required: true }]}>
            <Input placeholder="例如：可用持仓(万元)" />
          </Form.Item>
          <Form.Item label="源数据可用持仓单位" name="amount_unit" rules={[{ required: true }]}>
            <Select
              options={[
                { label: '万元', value: '万元' },
                { label: '张', value: '张' },
                { label: '元', value: '元' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};

export default PositionManagement;
