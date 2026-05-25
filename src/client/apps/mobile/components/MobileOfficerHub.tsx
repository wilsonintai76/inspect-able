import React from 'react';
import { ShieldCheck, Calendar, CheckCircle2, Clock, TrendingUp, GraduationCap, ShieldAlert, Info, Package } from 'lucide-react';
import {
  Box, Flex, HStack, VStack, Text, Heading, CardRoot, CardHeader, CardBody,
  Badge, SimpleGrid, Button, StatRoot, StatValueText, StatLabel,
} from '@chakra-ui/react';
import { User } from '@shared/types';
import { MobileSchedule } from './types';

interface Props {
  currentUser: User;
  mySchedules: MobileSchedule[];
  myStats: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    completionRate: number;
    workload: number;
  };
  certInfo: {
    days: number;
    status: 'safe' | 'warning' | 'expired';
    expiryDate: string;
  } | null;
  saving: string | null;
  threshold: number;
  onDateChange: (scheduleId: string, newDate: string) => Promise<void>;
  onLocate: (locationName: string) => void;
}

export const MobileOfficerHub: React.FC<Props> = ({
  currentUser,
  mySchedules,
  myStats,
  certInfo,
  saving,
  threshold,
  onDateChange,
  onLocate,
}) => {
  const isOverThreshold = myStats.workload >= threshold;

  return (
    <VStack gap={6} align="stretch">
      {/* Greeting Card */}
      <CardRoot variant="elevated" size="lg">
        <CardBody>
          <Flex direction={{ base: 'column', md: 'row' }} justify="space-between" align={{ base: 'flex-start', md: 'center' }} gap={4}>
            <Box>
              <Heading size="xl" fontWeight="bold" color="fg" display="flex" alignItems="center" gap={2}>
                <ShieldCheck size={24} color="var(--chakra-colors-indigo-600)" />
                Personal Officer Dashboard
              </Heading>
              <Text color="fg.muted" fontSize="sm" mt={1}>
                Welcome back, <Text as="span" fontWeight="bold" color="fg">{currentUser.name}</Text>. Manage your assigned inspections below.
              </Text>
            </Box>
            <Badge colorPalette="green" variant="subtle" size="lg" borderRadius="full" px={3} py={1.5} alignSelf={{ base: 'flex-start', md: 'auto' }}>
              <HStack gap={1}>
                <Box w={2} h={2} borderRadius="full" bg="green.500" animation="pulse" />
                <Text fontSize="2xs" fontWeight="bold" color="green.700" textTransform="uppercase">Active duty</Text>
              </HStack>
            </Badge>
          </Flex>
        </CardBody>
      </CardRoot>

      {/* Personal Stats Grid */}
      <SimpleGrid columns={{ base: 2, md: 3, lg: 5 }} gap={4}>
        {[
          { label: 'Total Assigned', value: myStats.total, icon: Calendar, color: 'blue' },
          { label: 'Completed', value: myStats.completed, icon: CheckCircle2, color: 'green' },
          { label: 'In Progress', value: myStats.inProgress, icon: Clock, color: 'orange' },
          { label: 'Completion Rate', value: `${myStats.completionRate}%`, icon: TrendingUp, color: 'indigo' },
          { label: 'Workload', value: `${myStats.workload.toLocaleString()} / ${threshold.toLocaleString()}`, icon: Package, color: isOverThreshold ? 'red' : 'indigo' },
        ].map((c, i) => (
          <StatRoot key={i} borderWidth="1px" borderColor="border.subtle" borderRadius="xl" p={4} bg="bg" shadow="xs">
            <HStack gap={3}>
              <Flex w={10} h={10} borderRadius="lg" bg={`${c.color}.50`} color={`${c.color}.600`} align="center" justify="center" flexShrink={0}>
                <c.icon size={20} />
              </Flex>
              <Box>
                <StatLabel fontSize="2xs" fontWeight="bold" color="fg.muted" textTransform="uppercase">{c.label}</StatLabel>
                <StatValueText fontSize="md" fontWeight="bold" color="fg">{c.value}</StatValueText>
              </Box>
            </HStack>
          </StatRoot>
        ))}
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, lg: 3 }} gap={6}>
        {/* Left Column: My Schedules */}
        <Box gridColumn={{ lg: 'span 2' }}>
          <CardRoot variant="elevated" size="sm" overflow="hidden">
            <CardHeader borderBottomWidth="1px" borderColor="border.subtle">
              <Flex justify="space-between" align="center" width="full">
                <Heading size="sm" fontWeight="bold">My Assigned Tasks</Heading>
                <Badge colorPalette="gray" variant="subtle" borderRadius="full" px={2.5}>
                  {mySchedules.length} {mySchedules.length === 1 ? 'Inspection' : 'Inspections'}
                </Badge>
              </Flex>
            </CardHeader>
            <CardBody p={0}>
              {mySchedules.map(s => (
                <Flex
                  key={s.id}
                  align="center"
                  gap={3}
                  px={4}
                  py={3}
                  borderBottomWidth="1px"
                  borderColor="border.subtle"
                  _hover={{ bg: 'bg.subtle' }}
                  _last={{ borderBottomWidth: 0 }}
                >
                  {/* Calendar date block */}
                  <Flex
                    w={12} h={12}
                    borderRadius="lg"
                    bg="bg.subtle"
                    borderWidth="1px"
                    borderColor="border.subtle"
                    direction="column"
                    align="center"
                    justify="center"
                    flexShrink={0}
                  >
                    <Text fontSize="2xs" fontWeight="bold" color="indigo.600" textTransform="uppercase" lineHeight={1}>
                      {s.date ? new Date(s.date + 'T00:00:00').toLocaleString('default', { month: 'short' }) : '—'}
                    </Text>
                    <Text fontSize="md" fontWeight="bold" color="fg" lineHeight={1}>
                      {s.date ? s.date.split('-')[2].replace(/^0/, '') : '—'}
                    </Text>
                  </Flex>

                  {/* Location & department */}
                  <Box flex={1} minW={0}>
                    <Text fontWeight="bold" color="fg" fontSize="sm" lineClamp={1}>{s.locationName}</Text>
                    <HStack gap={2} mt={0.5} flexWrap="wrap">
                      <Text fontSize="xs" color="fg.muted">{s.departmentName}</Text>
                      <Badge colorPalette="indigo" variant="subtle" size="xs">{s.totalAssets} Assets</Badge>
                    </HStack>
                  </Box>

                  {/* Status + Locate */}
                  <VStack gap={1} align="flex-end" flexShrink={0}>
                    <Badge
                      colorPalette={s.status === 'Completed' ? 'green' : s.status === 'In Progress' ? 'orange' : s.status === 'Awaiting Approval' ? 'blue' : 'gray'}
                      variant="subtle"
                      size="sm"
                      borderRadius="full"
                      fontWeight="bold"
                    >
                      {s.status}
                    </Badge>
                    <Button onClick={() => onLocate(s.locationName)} variant="ghost" colorPalette="indigo" size="2xs" fontWeight="bold">
                      Locate
                    </Button>
                  </VStack>
                </Flex>
              ))}
              {mySchedules.length === 0 && (
                <Flex direction="column" align="center" py={10}>
                  <Flex w={12} h={12} borderRadius="full" bg="bg.subtle" align="center" justify="center" mb={3}>
                    <Calendar size={24} color="var(--chakra-colors-fg-subtle)" />
                  </Flex>
                  <Text fontSize="xs" color="fg.muted" fontWeight="bold">No upcoming inspections assigned to you.</Text>
                </Flex>
              )}
            </CardBody>
          </CardRoot>
        </Box>

        {/* Right Column: Widgets */}
        <VStack gap={6} align="stretch">
          {/* Certification Widget */}
          {certInfo && (
            <Box
              borderRadius="2xl"
              p={5}
              color="white"
              shadow="md"
              position="relative"
              overflow="hidden"
              bg={certInfo.status === 'safe' ? 'indigo.600' : certInfo.status === 'warning' ? 'orange.500' : 'red.600'}
            >
              <GraduationCap
                size={96}
                style={{ position: 'absolute', right: -16, bottom: -16, opacity: 0.1 }}
              />
              <Box position="relative" zIndex={10}>
                <Flex justify="space-between" mb={3}>
                  <Text fontSize="sm" fontWeight="bold" textTransform="uppercase">Certification</Text>
                  <Badge variant="outline" color="white" borderColor="white/20" borderRadius="md" fontSize="2xs" fontWeight="bold">
                    {certInfo.status === 'expired' ? 'Expired' : `${certInfo.days} Days Left`}
                  </Badge>
                </Flex>
                <Text color="white/90" fontSize="xs">
                  {certInfo.status === 'safe' && `Your inspecting officer certificate is valid. It will expire on ${new Date(certInfo.expiryDate).toLocaleDateString()}.`}
                  {certInfo.status === 'warning' && `Your inspecting officer certificate is expiring soon on ${new Date(certInfo.expiryDate).toLocaleDateString()}. Please renew soon.`}
                  {certInfo.status === 'expired' && `Your certificate expired on ${new Date(certInfo.expiryDate).toLocaleDateString()}. Access to inspection forms is suspended.`}
                </Text>
              </Box>
            </Box>
          )}

          {/* Security Widget */}
          <CardRoot variant="elevated" size="sm">
            <CardBody gap={3}>
              <HStack gap={1.5}>
                <ShieldAlert size={16} color="var(--chakra-colors-indigo-600)" />
                <Text fontSize="xs" fontWeight="bold" color="fg.muted" textTransform="uppercase">Security Policy</Text>
              </HStack>
              <Text fontSize="xs" color="fg.muted">
                To protect your session in shared campus workspaces, this app will automatically log out if no activity is detected for{' '}
                <Text as="span" fontWeight="bold" color="fg">5 minutes</Text>.
              </Text>
              <Flex p={3} borderRadius="lg" bg="indigo.50" borderWidth="1px" borderColor="indigo.100" gap={2} align="flex-start">
                <Info size={14} color="var(--chakra-colors-indigo-600)" style={{ marginTop: 2, flexShrink: 0 }} />
                <Text fontSize="2xs" color="indigo.700" fontWeight="semibold">
                  Always sign out manually using the exit button in the top right profile menu when you are done.
                </Text>
              </Flex>
            </CardBody>
          </CardRoot>
        </VStack>
      </SimpleGrid>
    </VStack>
  );
};
