import React from 'react';
import { Calendar, Users, Package, Check } from 'lucide-react';
import { SimpleGrid, StatRoot, StatValueText, StatLabel, StatUpIndicator, Box, Flex } from '@chakra-ui/react';

interface Props {
  totalAssets: number;
  totalSlots: number;
  assigned: number;
  totalAuditors: number;
  completed: number;
}

export const MobileStatsBar: React.FC<Props> = ({ totalAssets, totalSlots, assigned, totalAuditors, completed }) => {
  const stats = [
    { label: 'Total Assets', value: totalAssets.toLocaleString(), color: 'indigo', icon: Package },
    { label: 'Total Slots', value: totalSlots.toString(), color: 'gray', icon: Calendar },
    { label: 'Assigned', value: `${assigned} / ${totalAuditors}`, color: 'blue', icon: Users },
    { label: 'Completed', value: completed.toString(), color: 'green', icon: Check },
  ];

  return (
    <SimpleGrid columns={{ base: 2, lg: 4 }} gap={{ base: 2, sm: 4 }}>
      {stats.map(({ label, value, color, icon: Icon }) => (
        <StatRoot
          key={label}
          borderWidth="1px"
          borderColor="border.subtle"
          borderRadius="2xl"
          p={{ base: 3, sm: 5 }}
          bg="bg"
          shadow="xs"
        >
          <Flex align="center" gap={{ base: 2, sm: 4 }} minW={0}>
            <Flex
              p={{ base: 1.5, sm: 2.5 }}
              borderRadius="lg"
              bg={`${color}.50`}
              color={`${color}.600`}
              flexShrink={0}
            >
              <Icon size={14} />
            </Flex>
            <Box minW={0}>
              <StatValueText fontSize={{ base: 'lg', sm: '2xl' }} fontWeight="bold" color="fg" truncate>
                {value}
              </StatValueText>
              <StatLabel fontSize="3xs" fontWeight="bold" color="fg.muted" textTransform="uppercase">
                {label}
              </StatLabel>
            </Box>
          </Flex>
        </StatRoot>
      ))}
    </SimpleGrid>
  );
};
