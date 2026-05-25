import React from 'react';
import { Calendar } from 'lucide-react';
import { Box, Flex, Text, VStack, Spinner, SimpleGrid } from '@chakra-ui/react';
import { MobileSchedule, MobileUser, MobilePhase, AssignRole } from './types';
import { ScheduleCard } from './ScheduleCard';

interface Props {
  schedules: MobileSchedule[];
  users: MobileUser[];
  phases: MobilePhase[];
  maxAssets: number;
  loading: boolean;
  saving: string | null;
  currentUserId: string;
  currentUserRoles: string[];
  onAssign: (scheduleId: string, userId: string, role: AssignRole) => Promise<void>;
  onUnassign: (scheduleId: string, role: AssignRole) => Promise<void>;
  onDateChange: (scheduleId: string, date: string) => Promise<void>;
  onShowToast: (message: string, type: 'success' | 'warning' | 'error' | 'info') => void;
}

export const MobileGrid: React.FC<Props> = ({
  schedules,
  users,
  phases,
  maxAssets,
  loading,
  saving,
  currentUserId,
  currentUserRoles,
  onAssign,
  onUnassign,
  onDateChange,
  onShowToast,
}) => {
  if (loading) {
    return (
      <VStack justify="center" py={32} gap={4}>
        <Spinner size="lg" color="indigo.500" />
        <Text fontSize="sm" fontWeight="bold" color="fg.muted">Loading schedule…</Text>
      </VStack>
    );
  }

  if (schedules.length === 0) {
    return (
      <VStack justify="center" py={32} gap={4}>
        <Calendar size={40} color="var(--chakra-colors-fg-subtle)" />
        <Text fontSize="sm" fontWeight="bold" color="fg.muted">No schedules match your filters</Text>
      </VStack>
    );
  }

  return (
    <>
      <Text fontSize="xs" fontWeight="bold" color="fg.muted" mb={4}>
        {schedules.length} slot{schedules.length !== 1 ? 's' : ''} shown
      </Text>
      <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} gap={4}>
        {schedules.map(s => (
          <ScheduleCard
            key={s.id}
            schedule={s}
            users={users}
            phases={phases}
            maxAssets={maxAssets}
            saving={saving}
            currentUserId={currentUserId}
            currentUserRoles={currentUserRoles}
            onAssign={onAssign}
            onUnassign={onUnassign}
            onDateChange={onDateChange}
            onShowToast={onShowToast}
          />
        ))}
      </SimpleGrid>
    </>
  );
};
