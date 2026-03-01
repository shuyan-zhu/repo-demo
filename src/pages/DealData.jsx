import React, { useEffect, useState } from 'react';
import { App, Tabs, Upload, Button, Table, Card, Space, Typography, InputNumber } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title } = Typography;
const API_BASE = import.meta.env.DEV ? '/api' : '';

const DealData = () => {
  const { message } = App.useApp();
  const [accountType, setAccountType] = useState('公募');
  const [dateRange, setDateRange] = useState(3);
  const [columns, setColumns] = useState([]);
  const [dataSource, setDataSource] = useState([]);
  const [loading, setLoading] = useState(false);
  const [latestDealDate, setLatestDealDate] = useState('');
  const [tableState, setTableState] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
    sortBy: 'bond_name',
    sortOrder: 'asc',
  });

  const getErrorMessage = (error, fallback) => error?.response?.data?.detail || fallback;

  const fetchData = async (type = accountType, overrides = {}) => {
    const next = { ...tableState, ...overrides };
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/matrix`, {
        params: {
          account_type: type,
          source_type: 'deal',
          page: next.current,
          page_size: next.pageSize,
          sort_by: next.sortBy,
          sort_order: next.sortOrder,
        },
      });

      const baseColumns = (res.data.columns || []).map((col) => {
        if (col.dataIndex === 'bond_name') {
          return {
            ...col,
            sorter: true,
            sortOrder: next.sortBy === 'bond_name' ? (next.sortOrder === 'asc' ? 'ascend' : 'descend') : null,
            render: (text) => <span style={{ color: '#000' }}>{text || '-'}</span>,
          };
        }

        return {
          ...col,
          render: (text) => <span style={{ color: text === '可押' ? '#52c41a' : '#ccc' }}>{text || '-'}</span>,
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
          sortOrder: next.sortBy === '_pledgeable_inst_cnt' ? (next.sortOrder === 'asc' ? 'ascend' : 'descend') : null,
          render: (_, record) => {
            const cnt = Number(record?._pledgeable_inst_cnt || 0);
            return <span style={{ color: '#000' }}>{cnt}</span>;
          },
        });
      }

      setColumns(baseColumns);
      setDataSource((res.data.dataSource || []).map((row) => ({
        ...row,
        _pledgeable_inst_cnt: Number(row?._pledgeable_inst_cnt || 0),
      })));

      setTableState((prev) => ({
        ...prev,
        ...next,
        total: Number(res.data.total || 0),
      }));
    } catch (error) {
      message.error(getErrorMessage(error, '加载成交矩阵失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchLatest = async () => {
      try {
        const res = await axios.get(`${API_BASE}/deals/latest-date`);
        if (res.data?.latest_deal_date) {
          setLatestDealDate(res.data.latest_deal_date);
        }
      } catch {}
    };
    fetchLatest();
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

  const uploadProps = {
    name: 'file',
    action: `${API_BASE}/deals/import`,
    data: { date_range: dateRange },
    onChange(info) {
      if (info.file.status === 'uploading') {
        setLoading(true);
      }
      if (info.file.status === 'done') {
        message.success(`${info.file.name} 导入成功`);
        const latest = info.file?.response?.latest_deal_date;
        if (latest) setLatestDealDate(latest);
        fetchData(accountType, { current: 1 });
      } else if (info.file.status === 'error') {
        message.error(`${info.file.name} 导入失败`);
        setLoading(false);
      }
    },
    showUploadList: false,
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Title level={4}>成交数据导入</Title>
          <Space>
            <span>回溯期限(月):</span>
            <InputNumber min={1} max={24} value={dateRange} onChange={setDateRange} />
            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />}>上传成交查询 Excel</Button>
            </Upload>
            {latestDealDate ? <span>最新成交日：{latestDealDate}</span> : null}
          </Space>
        </Space>
      </Card>

      <Card title="成交准入矩阵 (Deal Matrix)">
        <Tabs
          activeKey={accountType}
          onChange={setAccountType}
          items={[
            { key: '公募', label: '公募' },
            { key: '专户', label: '专户' },
          ]}
        />
        <Table
          rowKey="bond_name"
          scroll={{ x: 'max-content' }}
          loading={loading}
          columns={columns}
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
    </Space>
  );
};

export default DealData;
