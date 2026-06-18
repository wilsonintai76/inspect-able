import React, { useState, useEffect, useCallback } from 'react';
import {
  ReloadOutlined, BankOutlined, SafetyCertificateOutlined,
  TeamOutlined, ClockCircleOutlined, CheckCircleOutlined,
  CloseCircleOutlined, SyncOutlined, ExclamationCircleOutlined,
  TrophyOutlined, ApartmentOutlined, CalendarOutlined, DisconnectOutlined,
  DownOutlined, UpOutlined,
} from '@ant-design/icons';
import {
  Layout, Typography, Row, Col, Card, Statistic,
  Table, Tag, Space, Divider, Spin, Button, Timeline,
} from 'antd';
import { AutoUpdater } from '../../components/AutoUpdater';
import type {
  User, Department, Location, AuditSchedule, AuditPhase,
  KPITier, KPITierTarget, InstitutionKPITarget,
} from '../../../shared/types';

/* =======================================================================
   Kiosk Dashboard — mirror of InstitutionalSection
   Public-facing, auto-refreshing, no-login, full-width display
   ======================================================================= */

interface KioskData {
  schedules: any[];
  users: any[];
  departments: any[];
  locations: any[];
  phases: any[];
  buildings: any[];
  kpiTiers: any[];
  kpiTierTargets: any[];
  institutionKPIs: any[];
  activities: any[];
}

interface InspectorWorkload {
  name: string;
  id: string;
  deptName: string;
  assets: number;
  slots: number;
  certExpiry: string | null;
  isOverloaded: boolean;
}

export const KioskApp: React.FC = () => {
  const [data, setData] = useState<KioskData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/public/kiosk-dashboard');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: KioskData = await res.json();
      setData(json);
      setErr(null);
      setLastFetch(new Date());
    } catch (e: any) {
      setErr(e.message || 'Failed to load');
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Compute department asset summary from existing kiosk data (no extra fetch)
  const deptAssetSummary = React.useMemo(() => {
    const deptMap = new Map<string, any>();
    schedules.forEach(s => {
      if (s.status !== 'Completed') return;
      const statuses = (s as any).assetStatuses as Record<string, number> | null;
      if (!statuses || Object.keys(statuses).length === 0) return;
      const dept = departments.find(d => d.id === s.departmentId);
      if (!dept || dept.isArchived) return;
      if (!deptMap.has(s.departmentId)) {
        deptMap.set(s.departmentId, { deptId: s.departmentId, deptName: dept.name, deptAbbr: dept.abbr, total: 0, statuses: {} as Record<string, number>, locationCount: 0, locations: [] as any[] });
      }
      const d = deptMap.get(s.departmentId)!;
      d.locationCount++;
      const locTotal = Object.values(statuses).reduce((sum: number, v: any) => sum + (typeof v === 'number' ? v : 0), 0);
      const loc = locations.find(l => l.id === s.locationId);
      d.locations.push({ name: loc?.name || 'Unknown', total: locTotal, statuses });
      for (const [k, v] of Object.entries(statuses)) {
        d.statuses[k] = (d.statuses[k] || 0) + (typeof v === 'number' ? v : 0);
        d.total += typeof v === 'number' ? v : 0;
      }
    });
    return [...deptMap.values()].sort((a: any, b: any) => b.total - a.total);
  }, [schedules, departments, locations]);

  // ── Derived data (always computed, defaults to empty when data is null) ──
  const schedules = (data?.schedules ?? []) as AuditSchedule[];
  const users = (data?.users ?? []) as User[];
  const departments = (data?.departments ?? []) as Department[];
  const locations = (data?.locations ?? []) as Location[];
  const phases = (data?.phases ?? []) as AuditPhase[];
  const buildings = (data?.buildings ?? []) as any[];
  const kpiTiers = (data?.kpiTiers ?? []) as KPITier[];
  const kpiTierTargets = (data?.kpiTierTargets ?? []) as KPITierTarget[];
  const institutionKPIs = (data?.institutionKPIs ?? []) as InstitutionKPITarget[];
  // const activities = (data?.activities ?? []) as SystemActivity[];

  const today = new Date().toISOString().split('T')[0];

  const activeLocations = React.useMemo(() => locations.filter(l => l.status !== 'Archived'), [locations]);
  const activeLocationIds = React.useMemo(() => new Set(activeLocations.map(l => l.id)), [activeLocations]);

  const allInspectors = React.useMemo(() => {
    const certified = users.filter(u => {
      if (!u.certificationExpiry || u.certificationExpiry < today) return false;
      const roles = u.roles || [];
      if (roles.includes('Admin') || roles.includes('Coordinator')) return false;
      return true;
    });
    const map = new Map<string, InspectorWorkload>();
    certified.forEach(u => {
      const dept = departments.find(d => d.id === u.departmentId);
      map.set(u.id, {
        name: u.name || 'Unknown',
        id: u.id,
        deptName: dept?.abbr || dept?.name || 'N/A',
        assets: 0,
        slots: 0,
        certExpiry: u.certificationExpiry,
        isOverloaded: false,
      });
    });
    schedules.forEach(s => {
      if (!activeLocationIds.has(s.locationId)) return; // skip archived locations
      [s.auditor1Id, s.auditor2Id].forEach(aid => {
        if (!aid) return;
        const o = map.get(aid);
        if (o) {
          const loc = locations.find(l => l.id === s.locationId);
          o.assets += loc?.totalAssets || 0;
          o.slots += 1;
        }
      });
    });
    const result = Array.from(map.values());
    result.forEach(o => { o.isOverloaded = o.assets >= 500; });
    result.sort((a, b) => b.assets - a.assets);
    return result;
  }, [users, schedules, locations, departments, today, activeLocationIds]);

  const totalInspectors = allInspectors.length;
  const overloadedInspectors = allInspectors.filter(o => o.isOverloaded).length;

  const staffingGaps = React.useMemo(() => {
    return departments
      .filter(d => !d.isArchived)
      .map(d => {
        const deptUsers = users.filter(u => u.departmentId === d.id);
        const certified = deptUsers.filter(u => {
          if (!u.certificationExpiry || u.certificationExpiry < today) return false;
          const roles = u.roles || [];
          if (roles.includes('Admin') || roles.includes('Coordinator')) return false;
          return true;
        });
        const deptLocs = activeLocations.filter(l => l.departmentId === d.id);
        const deptTotalAssets = deptLocs.reduce((s, l) => s + (l.totalAssets || 0), 0);
        if (deptTotalAssets === 0) return null;
        const hasHod = !!d.headOfDeptId;
        return {
          id: d.id,
          name: d.name,
          abbr: d.abbr,
          totalUsers: deptUsers.length,
          certifiedOfficers: certified.length,
          hasHod,
          totalAssets: deptTotalAssets,
          gaps: [
            !hasHod && 'No HOD',
            certified.length === 0 && 'No QAIs',
            certified.length === 1 && 'Only 1 QAI',
          ].filter(Boolean) as string[],
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null && d.gaps.length > 0)
      .sort((a, b) => b.gaps.length - a.gaps.length);
  }, [departments, users, today, activeLocations]);

  const deptsWithGaps = staffingGaps.length;

  const auditStats = React.useMemo(() => {
    // Build a lookup: locationId → schedule (one schedule per location)
    const scheduleByLoc = new Map<string, (typeof schedules)[number]>();
    schedules.forEach(s => { if (activeLocationIds.has(s.locationId)) scheduleByLoc.set(s.locationId, s); });
    const totalLocations = activeLocations.length;
    const totalAssets = activeLocations.reduce((s, l) => s + (l.totalAssets || 0), 0);
    let completedAssets = 0;
    let completed = 0;
    let inProgress = 0;
    let assigned = 0;
    activeLocations.forEach(l => {
      const s = scheduleByLoc.get(l.id);
      if (s) {
        if (s.status === 'Completed') { completed++; completedAssets += (l.totalAssets || 0); }
        else if (s.status === 'In Progress') inProgress++;
        if (s.auditor1Id && s.auditor2Id) assigned++;
      }
    });
    return { totalLocations, totalAssets, completedAssets, total: totalLocations, assigned, inProgress, completed };
  }, [schedules, activeLocations, activeLocationIds]);

  const inspectionByDept = React.useMemo(() => {
    return departments
      .filter(d => !d.isArchived)
      .map(dept => {
        const deptLocs = activeLocations.filter(l => l.departmentId === dept.id);
        const totalAssets = deptLocs.reduce((s, l) => s + (l.totalAssets || 0), 0);
        if (totalAssets === 0) return null;
        const completedAssets = deptLocs.reduce((s, l) => {
          const sched = schedules.find(sc => sc.locationId === l.id);
          return s + (sched?.status === 'Completed' ? (l.totalAssets || 0) : 0);
        }, 0);
        const pending = deptLocs.filter(l => {
          const s = schedules.find(sc => sc.locationId === l.id);
          return !s || s.status === 'Pending';
        }).length;
        const inProgress = deptLocs.filter(l => schedules.find(sc => sc.locationId === l.id)?.status === 'In Progress').length;
        const completed = deptLocs.filter(l => schedules.find(sc => sc.locationId === l.id)?.status === 'Completed').length;
        const noSupervisor = deptLocs.filter(l => !l.supervisorId).length;
        const progress = totalAssets > 0 ? Math.round((completedAssets / totalAssets) * 100) : 0;
        return {
          id: dept.id,
          name: dept.abbr || dept.name,
          locs: deptLocs.length,
          totalAssets,
          pending,
          inProgress,
          completed,
          noSupervisor,
          progress,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null && d.locs > 0)
      .sort((a, b) => a.progress - b.progress);
  }, [departments, activeLocations, schedules]);

  const upcomingSchedules = React.useMemo(() => {
    return schedules
      .filter(s => s.status === 'In Progress' && activeLocationIds.has(s.locationId))
      .map(s => {
        const loc = locations.find(l => l.id === s.locationId);
        const dept = departments.find(d => d.id === s.departmentId);
        const a1 = users.find(u => u.id === s.auditor1Id);
        const a2 = users.find(u => u.id === s.auditor2Id);
        return {
          ...s,
          locationName: loc?.name || 'Unknown',
          deptAbbr: dept?.abbr || dept?.name || 'N/A',
          auditor1Name: a1?.name || '—',
          auditor2Name: a2?.name || '—',
          totalAssets: loc?.totalAssets || 0,
        };
      })
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [schedules, locations, departments, users, activeLocationIds]);

  const completedSchedules = React.useMemo(() => {
    return schedules
      .filter(s => s.status === 'Completed' && activeLocationIds.has(s.locationId))
      .map(s => {
        const loc = locations.find(l => l.id === s.locationId);
        const dept = departments.find(d => d.id === s.departmentId);
        return {
          ...s,
          locationName: loc?.name || 'Unknown',
          deptAbbr: dept?.abbr || dept?.name || 'N/A',
          totalAssets: loc?.totalAssets || 0,
        };
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 20);
  }, [schedules, locations, departments, activeLocationIds]);

  const noSupervisorCount = activeLocations.filter(l => !l.supervisorId).length;

  // ── Loading / Error states (after all hooks) ─────────────────────────
  if (!data && !err) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f5ff' }}>
        <Spin size="large" tip="Loading inspection dashboard…">
          <div style={{ padding: 50 }} />
        </Spin>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f5ff' }}>
        <Card style={{ maxWidth: 400, textAlign: 'center' }}>
          <CloseCircleOutlined style={{ fontSize: 48, color: '#ff4d4f', marginBottom: 16 }} />
          <Typography.Title level={4}>Unable to load dashboard</Typography.Title>
          <Typography.Text type="secondary">{err || 'Unknown error'}</Typography.Text>
          <br />
          <Button type="primary" onClick={fetchData} icon={<ReloadOutlined />} style={{ marginTop: 16 }}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  const completionPct = auditStats.totalAssets > 0 ? Math.round((auditStats.completedAssets / auditStats.totalAssets) * 100) : 0;

  return (
    <Layout style={{ minHeight: '100vh', background: '#f0f5ff' }}>
      <AutoUpdater isKioskApp />

      {/* ── Header ────────────────────────────────────────────────── */}
      <Layout.Header style={{
        background: '#fff',
        borderBottom: '1px solid #e8e8e8',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 56,
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <Space size="middle">
          <SafetyCertificateOutlined style={{ fontSize: 22, color: '#4f46e5' }} />
          <Typography.Title level={4} style={{ margin: 0 }}>
            Inspection Central
          </Typography.Title>
          <Tag color="processing">LIVE</Tag>
          {import.meta.env.VITE_APP_VERSION && (
            <Tag>v{import.meta.env.VITE_APP_VERSION}</Tag>
          )}
        </Space>
        <Space size="middle">
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {lastFetch ? `Updated ${lastFetch.toLocaleTimeString()}` : ''}
          </Typography.Text>
          <Button size="small" icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
        </Space>
      </Layout.Header>

      <Layout.Content style={{ padding: '24px 32px' }}>
        {/* ── Key Metrics Row ─────────────────────────────────────── */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={12} sm={6}>
            <Card bordered={false} style={{ borderRadius: 12 }}>
              <Statistic
                title="Total Assets"
                value={auditStats.totalAssets}
                formatter={v => (v as number).toLocaleString()}
                prefix={<ApartmentOutlined />}
                valueStyle={{ color: '#4f46e5', fontWeight: 800 }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card bordered={false} style={{ borderRadius: 12 }}>
              <Statistic
                title="Active Locations"
                value={auditStats.totalLocations}
                prefix={<BankOutlined />}
                valueStyle={{ fontWeight: 800 }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card bordered={false} style={{ borderRadius: 12 }}>
              <Statistic
                title="Completed"
                value={auditStats.completed}
                suffix={`/ ${auditStats.total}`}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#52c41a', fontWeight: 800 }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card bordered={false} style={{ borderRadius: 12 }}>
              <Statistic
                title="Completion"
                value={completionPct}
                suffix="%"
                prefix={<TrophyOutlined />}
                valueStyle={{ color: completionPct >= 80 ? '#52c41a' : completionPct >= 40 ? '#faad14' : '#ff4d4f', fontWeight: 800 }}
              />
              <Progress percent={completionPct} size="small" showInfo={false} style={{ marginTop: 8 }} />
            </Card>
          </Col>
        </Row>

        {/* ── Status Breakdown Tags ───────────────────────────────── */}
        <Card bordered={false} style={{ borderRadius: 12, marginBottom: 24 }}>
          <Space wrap size={[8, 8]}>
            <Typography.Text strong style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Status:</Typography.Text>
            <Tag icon={<ClockCircleOutlined />} color="default">
              Pending {auditStats.total - auditStats.inProgress - auditStats.completed}
            </Tag>
            <Tag icon={<SyncOutlined spin />} color="processing">
              In Progress {auditStats.inProgress}
            </Tag>
            <Tag icon={<CheckCircleOutlined />} color="success">
              Completed {auditStats.completed}
            </Tag>
            <Divider type="vertical" />
            <Tag color="error">Missing Supervisor {noSupervisorCount}</Tag>
            <Divider type="vertical" />
            <Space size={4}>
              <Tag color="indigo">{totalInspectors} Inspectors</Tag>
              <Tag color={overloadedInspectors > 0 ? 'red' : 'green'}>
                {overloadedInspectors} Overloaded
              </Tag>
              <Tag color={deptsWithGaps > 0 ? 'orange' : 'green'}>
                {deptsWithGaps} Gaps
              </Tag>
            </Space>
          </Space>
        </Card>

        {/* ── Inspection Status Cards ─────────────────────────────── */}
        <Card
          title={<Space><TeamOutlined />Inspection Status by Department</Space>}
          extra={<Tag>{inspectionByDept.length} departments</Tag>}
          bordered={false}
          style={{ borderRadius: 12, marginBottom: 24 }}
        >
          <Row gutter={[12, 12]}>
            {inspectionByDept.map(d => {
              const isExpanded = expandedDept === d.id;
              const progressColor = d.progress >= 80 ? '#52c41a' : d.progress >= 40 ? '#faad14' : '#ff4d4f';
              const borderColor = d.progress >= 80 ? '#b7eb8f' : d.progress >= 40 ? '#ffe58f' : '#ffa39e';
              return (
                <Col xs={24} sm={12} lg={12} key={d.id}>
                  <Card
                    hoverable
                    bordered={false}
                    onClick={() => setExpandedDept(isExpanded ? null : d.id)}
                    style={{
                      borderRadius: 12,
                      borderLeft: `6px solid ${progressColor}`,
                      transition: 'all 0.2s ease',
                      cursor: 'pointer',
                      background: isExpanded ? '#fafafa' : '#fff',
                    }}
                    bodyStyle={{ padding: 20 }}
                  >
                    {/* ── Header Row ──────────────────────────────────── */}
                    <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 10 }}>
                      <Typography.Text strong style={{ fontSize: 20, color: '#111', fontWeight: 900 }}>
                        {d.name}
                      </Typography.Text>
                      <Typography.Text strong style={{ fontSize: 28, color: progressColor, fontWeight: 900 }}>
                        {d.progress}%
                      </Typography.Text>
                    </Space>

                    {/* ── Progress Bar ────────────────────────────────── */}
                    <Progress
                      percent={d.progress}
                      strokeColor={progressColor}
                      trailColor="#e8e8e8"
                      showInfo={false}
                      style={{ marginBottom: 10 }}
                    />

                    {/* ── Meta Row ───────────────────────────────────── */}
                    <Space size={12} wrap style={{ marginBottom: 6 }}>
                      <Typography.Text style={{ fontSize: 15, color: '#333', fontWeight: 600 }}>
                        <ApartmentOutlined style={{ marginRight: 4 }} />
                        {d.locs} Locations
                      </Typography.Text>
                      <Typography.Text style={{ fontSize: 15, color: '#333', fontWeight: 600 }}>
                        · {d.totalAssets.toLocaleString()} Assets
                      </Typography.Text>
                    </Space>

                    {/* ── Status Badges ──────────────────────────────── */}
                    <Space size={6} wrap>
                      {d.completed > 0 && <Tag color="success" style={{ margin: 0, fontSize: 13, padding: '2px 10px' }}>✅ {d.completed}</Tag>}
                      {d.inProgress > 0 && <Tag color="processing" style={{ margin: 0, fontSize: 13, padding: '2px 10px' }}>🔄 {d.inProgress}</Tag>}
                      {d.pending > 0 && <Tag style={{ margin: 0, fontSize: 13, padding: '2px 10px' }}>⏸ {d.pending}</Tag>}
                      {d.noSupervisor > 0 && <Tag color="error" style={{ margin: 0, fontSize: 13, padding: '2px 10px' }}>⚠ {d.noSupervisor}</Tag>}
                      {d.completed === 0 && d.inProgress === 0 && d.pending === 0 && d.noSupervisor === 0 && (
                        <Typography.Text style={{ fontSize: 13, color: '#999' }}>No schedules</Typography.Text>
                      )}
                    </Space>

                    {/* ── Expand Hint ────────────────────────────────── */}
                    <div style={{ marginTop: 10, textAlign: 'center' }}>
                      <Typography.Text style={{ fontSize: 13, color: '#666', fontWeight: 600 }}>
                        {isExpanded ? (
                          <><UpOutlined style={{ marginRight: 4 }} />Collapse</>
                        ) : (
                          <><DownOutlined style={{ marginRight: 4 }} />Details</>
                        )}
                      </Typography.Text>
                    </div>

                    {/* ── Expanded Detail ────────────────────────────── */}
                    {isExpanded && (
                      <div style={{
                        marginTop: 14,
                        paddingTop: 14,
                        borderTop: '1px dashed #d9d9d9',
                        animation: 'fadeIn 0.25s ease',
                      }}>
                        <Row gutter={[10, 10]}>
                          <Col span={12}>
                            <div style={{ textAlign: 'center', padding: '12px 6px', borderRadius: 10, background: '#f6ffed' }}>
                              <div style={{ fontSize: 26, fontWeight: 900, color: '#52c41a' }}>{d.completed}</div>
                              <div style={{ fontSize: 14, color: '#555', fontWeight: 600 }}>Completed</div>
                            </div>
                          </Col>
                          <Col span={12}>
                            <div style={{ textAlign: 'center', padding: '12px 6px', borderRadius: 10, background: '#e6f7ff' }}>
                              <div style={{ fontSize: 26, fontWeight: 900, color: '#1890ff' }}>{d.inProgress}</div>
                              <div style={{ fontSize: 14, color: '#555', fontWeight: 600 }}>In Progress</div>
                            </div>
                          </Col>
                        </Row>
                        <Row gutter={[10, 10]} style={{ marginTop: 10 }}>
                          <Col span={12}>
                            <div style={{ textAlign: 'center', padding: '12px 6px', borderRadius: 10, background: '#f5f5f5' }}>
                              <div style={{ fontSize: 26, fontWeight: 900, color: '#333' }}>{d.pending}</div>
                              <div style={{ fontSize: 14, color: '#555', fontWeight: 600 }}>Pending</div>
                            </div>
                          </Col>
                          <Col span={12}>
                            <div style={{ textAlign: 'center', padding: '12px 6px', borderRadius: 10, background: d.noSupervisor > 0 ? '#fff1f0' : '#f5f5f5' }}>
                              <div style={{ fontSize: 26, fontWeight: 900, color: d.noSupervisor > 0 ? '#ff4d4f' : '#555' }}>{d.noSupervisor}</div>
                              <div style={{ fontSize: 14, color: '#555', fontWeight: 600 }}>No Supervisor</div>
                            </div>
                          </Col>
                        </Row>
                        <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 10, background: '#f0f5ff', textAlign: 'center' }}>
                          <Typography.Text style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>
                            ⚡ {d.totalAssets > 0 ? Math.round((d.totalAssets * d.progress / 100)).toLocaleString() : 0} / {d.totalAssets.toLocaleString()} assets inspected
                          </Typography.Text>
                        </div>
                      </div>
                    )}
                  </Card>
                </Col>
              );
            })}
          </Row>
        </Card>

        {/* ── Upcoming Schedule ─────────────────────────── */}
        {upcomingSchedules.length > 0 && (
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col xs={24}>
              <Card
                title={<Space><CalendarOutlined style={{ color: '#4f46e5' }} />Upcoming Schedule</Space>}
                extra={<Tag color="processing">{upcomingSchedules.length} locked</Tag>}
                bordered={false}
                style={{ borderRadius: 12 }}
                bodyStyle={{ maxHeight: 360, overflow: 'auto' }}
              >
                {upcomingSchedules.slice(0, 15).map(s => (
                  <Card.Grid key={s.id} style={{ width: '100%', padding: 12 }} hoverable={false}>
                    <Space align="start">
                      <div style={{ textAlign: 'center', minWidth: 44, background: '#f0f5ff', borderRadius: 8, padding: '4px 8px' }}>
                        <div style={{ fontSize: 10, color: '#4f46e5', fontWeight: 700 }}>
                          {s.date ? new Date(s.date + 'T00:00:00').toLocaleString('default', { month: 'short' }).toUpperCase() : '—'}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 900 }}>
                          {s.date ? new Date(s.date + 'T00:00:00').getDate() : '—'}
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <Typography.Text strong style={{ display: 'block' }}>{s.locationName}</Typography.Text>
                        <Space size={4}>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{s.deptAbbr}</Typography.Text>
                          <Tag color="indigo" style={{ fontSize: 10 }}>{s.totalAssets.toLocaleString()} Assets</Tag>
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                            {s.auditor1Name} + {s.auditor2Name}
                          </Typography.Text>
                        </Space>
                      </div>
                      <Tag color="processing">Ready</Tag>
                    </Space>
                  </Card.Grid>
                ))}
              </Card>
            </Col>
          </Row>
        )}

        {/* ── Inspector Workload Roster ───────────────────────────── */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={24} lg={14}>
            <Card
              title={<Space><TeamOutlined style={{ color: '#4f46e5' }} />Inspector Workload Roster</Space>}
              extra={<Tag>{totalInspectors} inspectors</Tag>}
              bordered={false}
              style={{ borderRadius: 12 }}
            >
              <Table
                dataSource={allInspectors.slice(0, 50)}
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ y: 320 }}
                columns={[
                  { title: 'Inspector', dataIndex: 'name', key: 'name', render: (v: string, r: any) => <Typography.Text strong>{v}</Typography.Text> },
                  { title: 'Dept', dataIndex: 'deptName', key: 'deptName', render: (v: string) => <Tag>{v}</Tag> },
                  { title: 'Slots', dataIndex: 'slots', key: 'slots', align: 'center' },
                  { title: 'Assets', dataIndex: 'assets', key: 'assets', align: 'right', render: (v: number) => <Typography.Text strong style={{ color: '#4f46e5' }}>{v.toLocaleString()}</Typography.Text> },
                  {
                    title: 'Status', key: 'status', align: 'center',
                    render: (_: any, r: any) => r.isOverloaded
                      ? <Tag color="error">Over</Tag>
                      : r.slots === 0 ? <Tag>Idle</Tag> : <Tag color="success">OK</Tag>,
                  },
                ]}
              />
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <Card
              title={<Space><ExclamationCircleOutlined style={{ color: '#fa8c16' }} />Staffing Gaps</Space>}
              extra={<Tag color="warning">{staffingGaps.length} depts</Tag>}
              bordered={false}
              style={{ borderRadius: 12 }}
              bodyStyle={{ maxHeight: 360, overflow: 'auto' }}
            >
              {staffingGaps.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32 }}>
                  <CheckCircleOutlined style={{ fontSize: 32, color: '#52c41a', marginBottom: 8 }} />
                  <Typography.Text type="secondary">All departments have QAIs</Typography.Text>
                </div>
              ) : (
                staffingGaps.map(d => (
                  <div key={d.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <Space>
                      <Typography.Text strong>{d.abbr || d.name}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>({(d.totalAssets || 0).toLocaleString()} assets)</Typography.Text>
                    </Space>
                    <div>
                      <Space size={4} style={{ marginTop: 4 }}>
                        <Tag color={d.certifiedOfficers === 0 ? 'error' : 'warning'}>
                          {d.certifiedOfficers} certified
                        </Tag>
                        {d.gaps.map((g, i) => <Tag key={i} color="error" style={{ fontSize: 10 }}>{g}</Tag>)}
                      </Space>
                    </div>
                  </div>
                ))
              )}
            </Card>
          </Col>
        </Row>

        {/* ── Recently Completed ───────────────────────── */}
        <Row gutter={16}>
          <Col xs={24} lg={12}>
            <Card
              title={<Space><CheckCircleOutlined style={{ color: '#52c41a' }} />Recently Completed</Space>}
              extra={<Tag color="success">{completedSchedules.length} locations</Tag>}
              bordered={false}
              style={{ borderRadius: 12 }}
              bodyStyle={{ maxHeight: 300, overflow: 'auto' }}
            >
              {completedSchedules.length === 0 ? (
                <Typography.Text type="secondary">No completed inspections yet</Typography.Text>
              ) : (
                <Timeline
                  items={completedSchedules.slice(0, 15).map(s => ({
                    color: 'green',
                    children: (
                      <div>
                        <Typography.Text strong>{s.locationName}</Typography.Text>
                        <div>
                          <Space size={4}>
                            <Tag>{s.deptAbbr}</Tag>
                            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                              {s.date} · {s.totalAssets.toLocaleString()} Assets
                            </Typography.Text>
                          </Space>
                        </div>
                      </div>
                    ),
                  }))}
                />
              )}
            </Card>
          </Col>
        </Row>

        {/* ── Department Asset Status ───────────────────── */}
        {deptAssetSummary.length > 0 && (
          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col xs={24}>
              <Card
                title={<Space><ApartmentOutlined style={{ color: '#4f46e5' }} />Asset Status by Department</Space>}
                extra={<Tag color="blue">{deptAssetSummary.length} depts</Tag>}
                bordered={false}
                style={{ borderRadius: 12 }}
              >
                <Table
                  dataSource={deptAssetSummary}
                  rowKey="deptId"
                  size="small"
                  pagination={false}
                  expandable={{
                    expandedRowRender: (dept: any) => (
                      <Table
                        dataSource={dept.locations.filter((l: any) => l.total > 0)}
                        rowKey="name"
                        size="small"
                        pagination={false}
                        showHeader={false}
                        columns={[
                          { title: 'Location', dataIndex: 'name', key: 'name', render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
                          {
                            title: 'Status', key: 'bar', render: (_: any, loc: any) => (
                              <Space size={4} wrap>
                                {Object.entries(loc.statuses).map(([k, v]: any) => (
                                  <Tag key={k} style={{ fontSize: 10 }}>{k}: {v}</Tag>
                                ))}
                              </Space>
                            ),
                          },
                          { title: 'Total', dataIndex: 'total', key: 'total', align: 'right', render: (v: number) => <Typography.Text strong>{v}</Typography.Text> },
                        ]}
                      />
                    ),
                    rowExpandable: (d: any) => (d.locations || []).length > 0,
                  }}
                  columns={[
                    { title: 'Department', dataIndex: 'deptName', key: 'dept', render: (v: string, r: any) => <Space><Typography.Text strong>{r.deptAbbr || v}</Typography.Text><Typography.Text type="secondary" style={{ fontSize: 10 }}>{r.locationCount} locs</Typography.Text></Space> },
                    {
                      title: 'Status Breakdown', key: 'bar',
                      render: (_: any, dept: any) => {
                        const colors: Record<string, string> = { 'In Use': '#52c41a', 'Not In Use': '#8c8c8c', 'Broken': '#ff4d4f', 'Under Maintenance': '#faad14', 'Borrowed': '#1890ff', 'Missing': '#cf1322' };
                        return (
                          <Space size={4} wrap>
                            {Object.entries(dept.statuses).map(([k, v]: any) => (
                              <Tag key={k} style={{ backgroundColor: colors[k] || '#d9d9d9', color: '#fff', border: 'none', fontSize: 10 }}>
                                {k}: {v}
                              </Tag>
                            ))}
                          </Space>
                        );
                      },
                    },
                    { title: 'Total', dataIndex: 'total', key: 'total', align: 'right', render: (v: number) => <Typography.Text strong style={{ fontSize: 14 }}>{v.toLocaleString()}</Typography.Text> },
                  ]}
                />
              </Card>
            </Col>
          </Row>
        )}

      </Layout.Content>
    </Layout>
  );
};

