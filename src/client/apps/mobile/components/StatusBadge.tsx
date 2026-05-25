import React from 'react';
import { Badge } from '@chakra-ui/react';

interface Props {
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  Pending: 'orange',
  'In Progress': 'blue',
  Completed: 'green',
};

export const StatusBadge: React.FC<Props> = ({ status }) => (
  <Badge
    colorPalette={STATUS_COLORS[status] ?? 'gray'}
    variant="subtle"
    size="sm"
    borderRadius="full"
    textTransform="uppercase"
    fontWeight="bold"
    fontSize="2xs"
  >
    {status}
  </Badge>
);
