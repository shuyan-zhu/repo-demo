import React, { useState } from 'react';
import { Layout, Menu, theme } from 'antd';
import { 
  DatabaseOutlined, 
  FileSearchOutlined, 
  TransactionOutlined,
  WalletOutlined 
} from '@ant-design/icons';
import ManualMaintenance from './pages/ManualMaintenance';
import Recommendation from './pages/Recommendation';
import DealData from './pages/DealData';
import PositionManagement from './pages/PositionManagement';

const { Header, Content, Sider } = Layout;

const App = () => {
  const [selectedKey, setSelectedKey] = useState('recommendation');
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const menuItems = [
    {
      key: 'recommendation',
      icon: <FileSearchOutlined />,
      label: '智能推荐',
    },
    {
      key: 'deal',
      icon: <TransactionOutlined />,
      label: '成交数据处理',
    },
    {
      key: 'maintenance',
      icon: <DatabaseOutlined />,
      label: '手工数据维护',
    },
    {
      key: 'position',
      icon: <WalletOutlined />,
      label: '可用持仓管理',
    },
  ];

  const renderContent = () => {
    switch (selectedKey) {
      case 'recommendation':
        return <Recommendation />;
      case 'deal':
        return <DealData />;
      case 'maintenance':
        return <ManualMaintenance />;
      case 'position':
        return <PositionManagement />;
      default:
        return <Recommendation />;
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0">
        <div style={{ height: 32, margin: 16, background: 'rgba(255, 255, 255, 0.2)', color: 'white', textAlign: 'center', lineHeight: '32px', fontWeight: 'bold' }}>
          智能推荐系统
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => setSelectedKey(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: 0, background: colorBgContainer }} />
        <Content style={{ margin: '24px 16px 0' }}>
          <div
            style={{
              padding: 24,
              minHeight: 360,
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
            }}
          >
            {renderContent()}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
