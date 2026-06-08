import React from 'react';
import { Search } from 'lucide-react';
import {
  Box, CardRoot, CardBody, Text, Button, VStack, FieldRoot, FieldLabel,
  NativeSelectRoot, NativeSelectField, Input, InputGroup, Stack,
} from '@chakra-ui/react';
import { MobilePhase } from './types';

interface Props {
  phases: MobilePhase[];
  uniqueDepartments: { id: string; name: string }[];
  uniqueBuildings: { id: string; name: string; abbr: string }[];
  uniqueLevels: string[];
  uniqueLocations: { id: string; name: string; buildingId?: string | null; buildingName?: string | null; buildingAbbr?: string | null; level?: string | null }[];
  search: string;
  phaseFilter: string;
  statusFilter: string;
  departmentFilter: string;
  buildingFilter: string;
  levelFilter: string;
  locationFilter: string;
  onSearchChange: (v: string) => void;
  onPhaseChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onDepartmentChange: (v: string) => void;
  onBuildingChange: (v: string) => void;
  onLevelChange: (v: string) => void;
  onLocationChange: (v: string) => void;
  onClearFilters: () => void;
}

export const MobileSidebar: React.FC<Props> = ({
  phases,
  uniqueDepartments,
  uniqueBuildings,
  uniqueLevels,
  uniqueLocations,
  search,
  phaseFilter,
  statusFilter,
  departmentFilter,
  buildingFilter,
  levelFilter,
  locationFilter,
  onSearchChange,
  onPhaseChange,
  onStatusChange,
  onDepartmentChange,
  onBuildingChange,
  onLevelChange,
  onLocationChange,
  onClearFilters,
}) => {
  const hasFilters = !!(search || phaseFilter || statusFilter || departmentFilter || buildingFilter || levelFilter || locationFilter);

  return (
    <VStack gap={5} align="stretch">
      {/* Search */}
      <InputGroup flex="1" startElement={<Search size={14} />}>
        <Input
          placeholder="Search location, inspector..."
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          size="sm"
          borderRadius="lg"
        />
      </InputGroup>

      {/* Filters card */}
      <CardRoot variant="elevated" size="sm">
        <CardBody gap={4}>
          <Text fontSize="xs" fontWeight="bold" color="fg.muted" textTransform="uppercase">
            Filters
          </Text>

          <Stack gap={3}>
            {/* Department */}
            <FieldRoot>
              <FieldLabel fontSize="2xs" fontWeight="bold" color="fg.muted">Department</FieldLabel>
              <NativeSelectRoot size="sm">
                <NativeSelectField
                  value={departmentFilter}
                  onChange={e => {
                    onDepartmentChange(e.target.value);
                    onBuildingChange('');
                    onLevelChange('');
                    onLocationChange('');
                  }}
                >
                  <option value="">All Departments</option>
                  {uniqueDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </NativeSelectField>
              </NativeSelectRoot>
            </FieldRoot>

            {/* Building */}
            <FieldRoot>
              <FieldLabel fontSize="2xs" fontWeight="bold" color="fg.muted">Building</FieldLabel>
              <NativeSelectRoot size="sm">
                <NativeSelectField
                  value={buildingFilter}
                  onChange={e => {
                    onBuildingChange(e.target.value);
                    onLevelChange('');
                    onLocationChange('');
                  }}
                >
                  <option value="">All Buildings</option>
                  {uniqueBuildings.map(b => <option key={b.id} value={b.id}>{b.name} ({b.abbr})</option>)}
                </NativeSelectField>
              </NativeSelectRoot>
            </FieldRoot>

            {/* Level */}
            <FieldRoot>
              <FieldLabel fontSize="2xs" fontWeight="bold" color="fg.muted">Level</FieldLabel>
              <NativeSelectRoot size="sm">
                <NativeSelectField
                  value={levelFilter}
                  onChange={e => {
                    onLevelChange(e.target.value);
                    onLocationChange('');
                  }}
                >
                  <option value="">All Levels</option>
                  {uniqueLevels.map(l => <option key={l} value={l}>Level {l}</option>)}
                </NativeSelectField>
              </NativeSelectRoot>
            </FieldRoot>

            {/* Location */}
            <FieldRoot>
              <FieldLabel fontSize="2xs" fontWeight="bold" color="fg.muted">Location</FieldLabel>
              <NativeSelectRoot size="sm">
                <NativeSelectField
                  value={locationFilter}
                  onChange={e => onLocationChange(e.target.value)}
                >
                  <option value="">All Locations</option>
                  {uniqueLocations.map(l => {
                    const parts = [l.buildingAbbr || l.buildingName, l.level ? `Lvl ${l.level}` : ''].filter(Boolean);
                    const label = parts.length ? `${l.name} (${parts.join(' - ')})` : l.name;
                    return <option key={l.id} value={l.id}>{label}</option>;
                  })}
                </NativeSelectField>
              </NativeSelectRoot>
            </FieldRoot>

            {/* Phase */}
            <FieldRoot>
              <FieldLabel fontSize="2xs" fontWeight="bold" color="fg.muted">Phase</FieldLabel>
              <NativeSelectRoot size="sm">
                <NativeSelectField
                  value={phaseFilter}
                  onChange={e => onPhaseChange(e.target.value)}
                >
                  <option value="">All Phases</option>
                  <option value="Unscheduled">Unscheduled</option>
                  {phases.map(p => <option key={p.id} value={p.id}>{p.name} ({p.startDate} to {p.endDate})</option>)}
                </NativeSelectField>
              </NativeSelectRoot>
            </FieldRoot>

            {/* Status */}
            <FieldRoot>
              <FieldLabel fontSize="2xs" fontWeight="bold" color="fg.muted">Status</FieldLabel>
              <NativeSelectRoot size="sm">
                <NativeSelectField
                  value={statusFilter}
                  onChange={e => onStatusChange(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </NativeSelectField>
              </NativeSelectRoot>
            </FieldRoot>
          </Stack>

          {hasFilters && (
            <Button onClick={onClearFilters} variant="ghost" colorPalette="indigo" size="xs" fontWeight="bold">
              Clear All Filters
            </Button>
          )}
        </CardBody>
      </CardRoot>
    </VStack>
  );
};

