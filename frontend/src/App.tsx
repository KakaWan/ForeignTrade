/** Main application layout — redesigned with better navigation, responsive layout, and dashboard. */

import { useEffect, useState } from 'react';
import {
  Layout, Menu, Typography, ConfigProvider, theme, Breadcrumb, Select, Space,
} from 'antd';
import {
  TeamOutlined, BankOutlined, SettingOutlined,
  BellOutlined, DashboardOutlined, AppstoreOutlined, SendOutlined, GlobalOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/en';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import PeoplePage from './pages/PeoplePage';
import CompaniesPage from './pages/CompaniesPage';
import SettingsPage from './pages/SettingsPage';
import FollowUpsPage from './pages/FollowUpsPage';
import LetterGeneratorPage from './pages/LetterGeneratorPage';
import { useI18n } from './i18n';

const { Sider, Content, Header } = Layout;
const { Text } = Typography;

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { lang, setLang, t, languages, pack } = useI18n();

  useEffect(() => {
    dayjs.locale(pack.dayjsLocale);
    document.title = `${t('外贸助手')} - ForeignTrade Assistant`;
  }, [lang, pack.dayjsLocale, t]);

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: t('仪表盘') },
    { key: '/people', icon: <TeamOutlined />, label: t('联系人') },
    { key: '/companies', icon: <BankOutlined />, label: t('企业管理') },
    { key: '/letter-generator', icon: <SendOutlined />, label: t('开发信') },
    { key: '/follow-ups', icon: <BellOutlined />, label: t('跟进提醒') },
    { key: '/settings', icon: <SettingOutlined />, label: t('设置') },
  ];

  const breadcrumbMap: Record<string, string> = {
    '/': t('仪表盘'),
    '/people': t('联系人'),
    '/companies': t('企业管理'),
    '/letter-generator': t('开发信'),
    '/follow-ups': t('跟进提醒'),
    '/settings': t('设置'),
  };

  return (
    <ConfigProvider
      locale={pack.antdLocale}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#4f46e5',
          borderRadius: 8,
          colorBgContainer: '#ffffff',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        },
        components: {
          Menu: { itemBorderRadius: 8 },
          Table: {
            headerBg: '#f8fafc',
            rowHoverBg: '#f1f5f9',
            // antd 默认 14px，比表内正文（12–13px）偏大、表头显得笨重；统一降到 13px
            cellFontSize: 13,    // 默认尺寸表格
            cellFontSizeMD: 13,  // size="middle"
            cellFontSizeSM: 13,  // size="small"
          },
          Button: { borderRadius: 8 },
        },
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={200}
          breakpoint="lg"
          collapsedWidth={64}
          style={{
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            background: 'linear-gradient(180deg, #1e1b4b 0%, #312e81 100%)',
            boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
          }}
        >
          <div style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            margin: 0,
            padding: '0 16px',
          }}>
            <AppstoreOutlined style={{ color: '#a5b4fc', fontSize: 24 }} />
            {!collapsed && (
              <Text strong style={{ color: '#e0e7ff', fontSize: 16, marginLeft: 10, whiteSpace: 'nowrap' }}>
                {t('外贸助手')}
              </Text>
            )}
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{
              background: 'transparent',
              borderRight: 0,
              marginTop: 8,
            }}
          />
        </Sider>
        <Layout style={{
          marginLeft: collapsed ? 64 : 200,
          transition: 'margin-left 0.2s',
          minHeight: '100vh',
        }}>
          <Header style={{
            padding: '0 24px',
            background: '#fff',
            borderBottom: '1px solid #e2e8f0',
            height: 52,
            lineHeight: '52px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 10,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}>
            <Breadcrumb
              items={[{ title: t('外贸助手') }, { title: breadcrumbMap[location.pathname] || '' }]}
              style={{ fontSize: 14 }}
            />
            <Space size={10}>
              <Select
                size="small"
                value={lang}
                onChange={setLang}
                options={languages.map((item) => ({ label: item.label, value: item.code }))}
                suffixIcon={<GlobalOutlined />}
                aria-label={t('语言')}
                style={{ width: 108 }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                ForeignTrade Assistant v0.1
              </Text>
            </Space>
          </Header>
          <Content style={{
            overflow: 'auto',
            background: '#f8fafc',
            padding: 0,
            minHeight: 'calc(100vh - 52px)',
          }}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/people" element={<PeoplePage />} />
              <Route path="/companies" element={<CompaniesPage />} />
              <Route path="/letter-generator" element={<LetterGeneratorPage />} />
              <Route path="/follow-ups" element={<FollowUpsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
