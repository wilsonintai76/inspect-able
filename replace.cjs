const fs = require('fs');

function replaceInFile(file, replacements) {
  let content = fs.readFileSync(file, 'utf8');
  for (const { searchValue, replaceValue } of replacements) {
    content = content.split(searchValue).join(replaceValue);
  }
  fs.writeFileSync(file, content, 'utf8');
}

// src/shared/types.ts
replaceInFile('src/shared/types.ts', [
  { searchValue: "'Pending' | 'Awaiting Approval' | 'In Progress' | 'Completed'", replaceValue: "'Pending' | 'In Progress' | 'Completed'" }
]);

// src/server/services/emailService.ts
replaceInFile('src/server/services/emailService.ts', [
  { searchValue: "* \"Awaiting Approval\" (all 4 fields filled: date, supervisor, auditor1, auditor2).", replaceValue: "* \"In Progress\" (all 4 fields filled: date, supervisor, auditor1, auditor2)." },
  { searchValue: "Awaiting Approval —", replaceValue: "Assigned —" }
]);

// src/server/routes/public.ts (Remove Awaiting Approval transitions)
replaceInFile('src/server/routes/public.ts', [
  { searchValue: "// Auto-activation check (Pending -> Awaiting Approval once assignments are complete)", replaceValue: "// Auto-activation check (Pending -> In Progress once assignments are complete)" },
  { searchValue: "UPDATE audit_schedules SET status = 'Awaiting Approval'", replaceValue: "UPDATE audit_schedules SET status = 'In Progress', is_locked = 1" },
  { searchValue: "updatedSchedule.status === 'In Progress' || updatedSchedule.status === 'Awaiting Approval'", replaceValue: "updatedSchedule.status === 'In Progress'" },
  { searchValue: "// Revert Awaiting Approval / In Progress -> Pending if any assignment is missing", replaceValue: "// Revert In Progress -> Pending if any assignment is missing" },
  { searchValue: "remaining && (remaining.status === 'In Progress' || remaining.status === 'Awaiting Approval')", replaceValue: "remaining && remaining.status === 'In Progress'" }
]);

// src/server/routes/db.users.ts
replaceInFile('src/server/routes/db.users.ts', [
  { searchValue: "audit.status === 'Awaiting Approval' || audit.status === 'In Progress'", replaceValue: "audit.status === 'In Progress'" }
]);

// src/server/routes/db.shared.ts
replaceInFile('src/server/routes/db.shared.ts', [
  { searchValue: "'Pending':            ['Awaiting Approval', 'In Progress'],", replaceValue: "'Pending':            ['In Progress']," },
  { searchValue: "'Awaiting Approval':  ['Pending', 'In Progress'],\n", replaceValue: "" },
  { searchValue: "'In Progress':        ['Awaiting Approval', 'Pending', 'Completed'],", replaceValue: "'In Progress':        ['Pending', 'Completed']," }
]);

// src/server/index.ts
replaceInFile('src/server/index.ts', [
  { searchValue: "WHERE a.status = 'Awaiting Approval' AND a.date = ?", replaceValue: "WHERE a.status = 'In Progress' AND a.date = ?" }
]);

// src/client/hooks/useAuditActions.ts
replaceInFile('src/client/hooks/useAuditActions.ts', [
  { searchValue: "// Evaluate if the status should actually be Awaiting Approval before we lock it", replaceValue: "// Evaluate if the status should actually be In Progress before we lock it" },
  { searchValue: "const resolvedStatus = (currentStatus === 'Pending' && allFields) ? 'Awaiting Approval' : currentStatus;", replaceValue: "const resolvedStatus = (currentStatus === 'Pending' && allFields) ? 'In Progress' : currentStatus;" },
  { searchValue: "if (newLocked && resolvedStatus === 'Awaiting Approval') updated.status = 'In Progress';\n        else if (!newLocked && resolvedStatus === 'In Progress') updated.status = 'Awaiting Approval';", replaceValue: "if (!newLocked && resolvedStatus === 'In Progress') updated.status = 'Pending';" },
  { searchValue: "updated.status = 'Awaiting Approval';", replaceValue: "updated.status = 'In Progress';\n          updated.isLocked = true;" },
  { searchValue: "(updated.status === 'In Progress' || updated.status === 'Awaiting Approval')", replaceValue: "updated.status === 'In Progress'" },
  { searchValue: "updates.status = 'Awaiting Approval';", replaceValue: "updates.status = 'In Progress';\n          updates.isLocked = true;" },
  { searchValue: "(currentStatus === 'In Progress' || currentStatus === 'Awaiting Approval')", replaceValue: "currentStatus === 'In Progress'" }
]);

// src/client/components/dashboard/InstitutionalSection.tsx
replaceInFile('src/client/components/dashboard/InstitutionalSection.tsx', [
  { searchValue: ".filter(s => s.status === 'Awaiting Approval')", replaceValue: ".filter(s => false /* Removed Awaiting Approval */)" },
  { searchValue: "awaitingApproval: activeSchedules.filter(s => s.status === 'Awaiting Approval').length,", replaceValue: "awaitingApproval: 0," },
  { searchValue: "const awaiting = deptLocs.filter(l => schedules.find(sc => sc.locationId === l.id)?.status === 'Awaiting Approval').length;", replaceValue: "const awaiting = 0;" }
]);

// src/client/components/AuditTable.tsx
replaceInFile('src/client/components/AuditTable.tsx', [
  { searchValue: "case 'Awaiting Approval': return 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100 hover:border-amber-300 cursor-pointer';\n", replaceValue: "" }
]);

// src/client/apps/kiosk/KioskApp.tsx
replaceInFile('src/client/apps/kiosk/KioskApp.tsx', [
  { searchValue: "else if (s.status === 'Awaiting Approval') awaitingApproval++;\n", replaceValue: "" },
  { searchValue: "const awaiting = deptLocs.filter(l => schedules.find(sc => sc.locationId === l.id)?.status === 'Awaiting Approval').length;", replaceValue: "const awaiting = 0;" },
  { searchValue: ".filter(s => s.status === 'Awaiting Approval' && activeLocationIds.has(s.locationId))", replaceValue: ".filter(s => false)" }
]);

// src/client/components/audit-table/AuditFiltersBar.tsx
replaceInFile('src/client/components/audit-table/AuditFiltersBar.tsx', [
  { searchValue: "<option value=\"Awaiting Approval\">Awaiting Approval</option>\n", replaceValue: "" }
]);

// src/client/apps/mobile/components/MobileInspectorHub.tsx
replaceInFile('src/client/apps/mobile/components/MobileInspectorHub.tsx', [
  { searchValue: "colorPalette={s.status === 'Completed' ? 'green' : s.status === 'In Progress' ? 'orange' : s.status === 'Awaiting Approval' ? 'blue' : 'gray'}", replaceValue: "colorPalette={s.status === 'Completed' ? 'green' : s.status === 'In Progress' ? 'orange' : 'gray'}" }
]);

console.log('Replacements completed.');
