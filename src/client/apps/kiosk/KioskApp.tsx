import React from 'react';
import { Layout, Typography, Card, Space, Tag } from 'antd';
import {
  BankOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

export const KioskApp: React.FC = () => {
  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Header
        style={{
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
        }}
      >
        <Space>
          <BankOutlined style={{ fontSize: 24, color: '#4f46e5' }} />
          <Title level={4} style={{ margin: 0 }}>
            Institutional Hub
          </Title>
          <Tag color="blue">Kiosk</Tag>
        </Space>
      </Header>

      <Content style={{ padding: '48px 24px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <SafetyCertificateOutlined
            style={{ fontSize: 64, color: '#4f46e5', marginBottom: 16 }}
          />
          <Title level={2}>Welcome to the Institutional Hub</Title>
          <Text type="secondary" style={{ fontSize: 16 }}>
            Centralized institutional dashboard for asset inspection oversight and
            compliance monitoring.
          </Text>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 24,
          }}
        >
          <Card title="Institutional Overview" bordered={false}>
            <Space direction="vertical">
              <Text>
                <TeamOutlined /> Institutional-wide audit statistics and
                compliance metrics will appear here.
              </Text>
            </Space>
          </Card>

          <Card title="Department Compliance" bordered={false}>
            <Text type="secondary">
              Per-department breakdown charts and reports.
            </Text>
          </Card>

          <Card title="Inspector Performance" bordered={false}>
            <Text type="secondary">
              Cross-institution inspector workload and performance dashboards.
            </Text>
          </Card>
        </div>
      </Content>
    </Layout>
  );
};
