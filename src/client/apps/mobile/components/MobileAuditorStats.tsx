import React from 'react';
import { UserCheck, Package } from 'lucide-react';
import { Box, HStack, Text, VStack, SimpleGrid, CardRoot, CardBody, Badge } from '@chakra-ui/react';

interface AuditorStat {
  name: string;
  assets: number;
  slots: number;
}

interface Props {
  stats: AuditorStat[];
  threshold: number;
}

export const MobileAuditorStats: React.FC<Props> = ({ stats, threshold }) => {
  if (stats.length === 0) return null;

  return (
    <Box mt={6}>
      <HStack gap={2} mb={3}>
        <UserCheck size={16} color="var(--chakra-colors-indigo-600)" />
        <Text fontSize="xs" fontWeight="bold" color="fg.muted" textTransform="uppercase">
          Certified Auditor Workload
        </Text>
      </HStack>

      <SimpleGrid columns={{ base: 1, sm: 2 }} gap={3}>
        {stats.map((stat, idx) => {
          const isOverThreshold = stat.assets >= threshold;
          return (
            <CardRoot key={idx} variant="elevated" size="sm">
              <CardBody>
                <HStack justify="space-between">
                  <VStack align="flex-start" gap={0}>
                    <Text fontSize="sm" fontWeight="bold" color="fg">{stat.name}</Text>
                    <Text fontSize="2xs" fontWeight="bold" color="fg.muted" textTransform="uppercase">
                      {stat.slots} Slot{stat.slots !== 1 ? 's' : ''} Assigned
                    </Text>
                  </VStack>
                  <Badge
                    colorPalette={isOverThreshold ? 'red' : 'indigo'}
                    variant="subtle"
                    size="lg"
                    borderRadius="lg"
                    px={3}
                    py={1.5}
                  >
                    <HStack gap={1}>
                      <Package size={14} />
                      <Text fontSize="sm" fontWeight="bold">
                        {stat.assets.toLocaleString()} / {threshold.toLocaleString()}
                      </Text>
                    </HStack>
                  </Badge>
                </HStack>
              </CardBody>
            </CardRoot>
          );
        })}
      </SimpleGrid>
    </Box>
  );
};
