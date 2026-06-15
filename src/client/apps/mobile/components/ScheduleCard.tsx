import React from 'react';
import { Calendar, Package, Loader2, Phone, Plus, X } from 'lucide-react';
import {
  CardRoot, CardHeader, CardBody,
  Box, Flex, HStack, VStack, Text, Badge, Button, IconButton,
  Input, Separator, Spinner,
} from '@chakra-ui/react';
import { MobileSchedule, MobileUser, MobilePhase, AssignRole } from './types';
import { StatusBadge } from './StatusBadge';

const ROLE_LABELS: Record<AssignRole, string> = {
  supervisor: 'Supervisor',
  auditor1: 'Inspector 1',
  auditor2: 'Inspector 2',
};

interface Props {
  schedule: MobileSchedule;
  users: MobileUser[];
  phases: MobilePhase[];
  maxAssets: number;
  saving: string | null;
  currentUserId: string;
  currentUserRoles: string[];
  onAssign: (scheduleId: string, userId: string, role: AssignRole) => Promise<void>;
  onUnassign: (scheduleId: string, role: AssignRole) => Promise<void>;
  onDateChange: (scheduleId: string, date: string) => Promise<void>;
  onShowToast: (message: string, type: 'success' | 'warning' | 'error' | 'info') => void;
}

export const ScheduleCard: React.FC<Props> = ({
  schedule,
  users,
  phases,
  maxAssets,
  saving,
  currentUserId,
  currentUserRoles,
  onAssign,
  onUnassign,
  onDateChange,
  onShowToast,
}) => {
  const isSaving = saving === schedule.id;
  const isCompleted = schedule.status === 'Completed';
  const isLocked = schedule.isLocked === true;

  // Get global date boundaries across all phases to allow planned phase overwriting
  const minDate = phases.length > 0
    ? phases.reduce((min, p) => p.startDate < min ? p.startDate : min, phases[0].startDate)
    : schedule.phaseStart;
  const maxDate = phases.length > 0
    ? phases.reduce((max, p) => p.endDate > max ? p.endDate : max, phases[0].endDate)
    : schedule.phaseEnd;
  const today = new Date().toISOString().split('T')[0];
  const phaseActive = today >= schedule.phaseStart && today <= schedule.phaseEnd;

  const roleUsers = (role: AssignRole): MobileUser[] => {
    if (role === 'supervisor') return [];
    return users.filter(
      u =>
        u.certificationExpiry && u.certificationExpiry >= today &&
        u.departmentId !== schedule.departmentId &&
        u.id === currentUserId,
    );
  };

  const currentUser = users.find(u => u.id === currentUserId);
  const isAdmin = currentUserRoles.includes('Admin');
  const isCoSupervisor = currentUserRoles.includes('Coordinator') || currentUserRoles.includes('Supervisor');
  const isOwnDept = currentUser?.departmentId === schedule.departmentId;
  const isPrivileged = isAdmin || (isCoSupervisor && isOwnDept);
  
  const userCanAudit = currentUser?.departmentId !== schedule.departmentId;
  const isCertified = !!(currentUser?.certificationExpiry && currentUser.certificationExpiry >= today);
  const canEditThisDate = isPrivileged || (isCertified && userCanAudit);

  return (
    <CardRoot
      variant="elevated"
      size="sm"
      opacity={isCompleted ? 0.75 : 1}
      transition="all 0.2s"
      _hover={{ boxShadow: 'lg' }}
    >
      {/* ── Header ───────────────────────────────────────────────────── */}
      <CardHeader pb={2}>
        <Flex justify="space-between" align="flex-start" gap={3}>
          <Box flex={1} minW={0}>
            <HStack gap={2} mb={1.5} flexWrap="wrap">
              <Badge colorPalette="gray" variant="subtle" size="sm" borderRadius="md" fontWeight="bold">
                {schedule.departmentAbbr}
              </Badge>
              <StatusBadge status={schedule.status} />
              {phaseActive && (
                <Badge colorPalette="blue" variant="solid" size="sm" borderRadius="md" fontWeight="bold">
                  ACTIVE
                </Badge>
              )}
            </HStack>
            <Text fontWeight="bold" color="fg" fontSize="sm" lineClamp={2} mb={0.5}>
              {schedule.locationName}
            </Text>
            {(schedule.buildingName || schedule.level) && (
              <Text fontSize="2xs" color="fg.muted" fontWeight="bold" textTransform="uppercase" mb={1}>
                {schedule.buildingName}{schedule.level ? ` • Level ${schedule.level}` : ''}
              </Text>
            )}
            <Text fontSize="xs" color="fg.muted" fontWeight="medium" lineClamp={2}>
              {schedule.departmentName}
            </Text>
          </Box>

          {/* Asset count */}
          <Box textAlign="right" flexShrink={0}>
            <HStack gap={1} color="fg">
              <Package size={14} color="var(--chakra-colors-indigo-500)" />
              <Text fontSize="lg" fontWeight="bold">{schedule.totalAssets.toLocaleString()}</Text>
            </HStack>
            <Text fontSize="2xs" color="fg.muted" fontWeight="bold" textTransform="uppercase">assets</Text>
          </Box>
        </Flex>
      </CardHeader>

      {/* ── Phase & Date ─────────────────────────────────────────────── */}
      <Box bg="bg.subtle" px={4} py={2.5} borderTopWidth="1px" borderColor="border.subtle">
        <Flex justify="space-between" align="center" mb={2}>
          <HStack gap={1.5} flexShrink={0}>
            <Calendar size={14} color="var(--chakra-colors-fg-muted)" />
            <Text fontSize="xs" fontWeight="bold" color="fg">{schedule.phaseName}</Text>
          </HStack>
          <Text fontSize="2xs" color="fg.muted" fontWeight="medium">
            {schedule.phaseStart} to {schedule.phaseEnd}
          </Text>
        </Flex>

        {/* Date setter */}
        <HStack gap={2} pl={4}>
          <Text fontSize="2xs" fontWeight="bold" color="indigo.400" textTransform="uppercase" flexShrink={0}>
            Set Date:
          </Text>
          <Box flex={1} minW={0}>
            {!isCompleted && !isLocked && canEditThisDate ? (
              <Input
                type="date"
                value={schedule.date ?? ''}
                title="Set inspection date"
                onChange={e => onDateChange(schedule.id, e.target.value)}
                size="xs"
                fontSize="xs"
                fontWeight="bold"
                variant="outline"
              />
            ) : (
              <Box px={2} py={1} bg="bg" borderWidth="1px" borderColor="border.subtle" borderRadius="md">
                <Text fontSize="xs" fontWeight="bold" color="fg.muted">
                  {schedule.date ?? 'No date set'}
                </Text>
              </Box>
            )}
          </Box>
          {isSaving && <Spinner size="sm" color="indigo.500" flexShrink={0} />}
        </HStack>
      </Box>

      <Separator />

      {/* ── Assignments ──────────────────────────────────────────────── */}
      <CardBody pt={3}>
        <VStack gap={3} align="stretch">
          {(['supervisor', 'auditor1', 'auditor2'] as AssignRole[]).map(role => {
            const currentName = schedule[`${role}Name` as keyof MobileSchedule] as string | null;
            const currentContact = schedule[`${role}Contact` as keyof MobileSchedule] as string | null;
            const assignedId = schedule[`${role}Id` as keyof MobileSchedule] as string | null;
            const isAssignedToMe = assignedId === currentUserId;
            const showReadOnly = role === 'supervisor' || isCompleted || isLocked || (!!currentName && !isAssignedToMe);

            return (
              <Box key={role}>
                <Text fontSize="2xs" fontWeight="bold" color="fg.muted" textTransform="uppercase" mb={1}>
                  {ROLE_LABELS[role]}
                </Text>

                {showReadOnly ? (
                  <Box px={3} py={2} bg="bg.subtle" borderRadius="lg">
                    <Text fontSize="xs" fontWeight="bold" color="fg">{currentName ?? '—'}</Text>
                    {currentContact && (
                      <HStack gap={1} mt={0.5}>
                        <Phone size={10} color="var(--chakra-colors-fg-subtle)" />
                        <Text fontSize="2xs" color="fg.muted" fontWeight="bold" fontFamily="mono">
                          {currentContact}
                        </Text>
                      </HStack>
                    )}
                  </Box>
                ) : isAssignedToMe ? (
                  <Flex align="center" justify="space-between" px={3} py={2} bg="indigo.50" borderWidth="1px" borderColor="indigo.200" borderRadius="lg">
                    <Box flex={1} minW={0}>
                      <Text fontSize="xs" fontWeight="bold" color="indigo.800" truncate>{currentName}</Text>
                      {currentContact && (
                        <HStack gap={1} mt={0.5}>
                          <Phone size={10} />
                          <Text fontSize="2xs" color="indigo.600" fontWeight="bold" fontFamily="mono">
                            {currentContact}
                          </Text>
                        </HStack>
                      )}
                    </Box>
                    <IconButton
                      aria-label="Remove my assignment"
                      onClick={() => onUnassign(schedule.id, role)}
                      disabled={isSaving}
                      variant="ghost"
                      size="xs"
                      colorPalette="red"
                      ml={2}
                      flexShrink={0}
                    >
                      <X size={14} />
                    </IconButton>
                  </Flex>
                ) : (
                  (() => {
                    const eligible = roleUsers(role);
                    const inspectionIsPast = !!(schedule.date && schedule.date < today);
                    const noDate = !schedule.date;
                    const canAssign = eligible.length > 0 && !inspectionIsPast;
                    return (
                      <Button
                        onClick={() => {
                          if (noDate) {
                            onShowToast('Please set the inspection date for this schedule before assigning yourself.', 'warning');
                            return;
                          }
                          if (canAssign) onAssign(schedule.id, currentUserId, role);
                        }}
                        disabled={isSaving || eligible.length === 0 || inspectionIsPast}
                        variant="solid"
                        colorPalette={noDate ? 'orange' : canAssign ? 'indigo' : 'gray'}
                        size="sm"
                        width="full"
                        fontWeight="bold"
                        textTransform="uppercase"
                        fontSize="xs"
                        title={eligible.length === 0 ? 'You are not eligible for this slot' : inspectionIsPast ? 'Inspection date has passed' : noDate ? 'Tap to see what to do first' : ''}
                      >
                        <Plus size={14} />
                        Assign Myself
                      </Button>
                    );
                  })()
                )}
              </Box>
            );
          })}
        </VStack>
      </CardBody>
    </CardRoot>
  );
};

