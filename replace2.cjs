const fs = require('fs');

function replaceInFile(file, replacements) {
  let content = fs.readFileSync(file, 'utf8');
  for (const { searchValue, replaceValue } of replacements) {
    content = content.split(searchValue).join(replaceValue);
  }
  fs.writeFileSync(file, content, 'utf8');
}

replaceInFile('src/client/hooks/useAuditActions.ts', [
  { searchValue: "// Evaluate if the status should actually be Awaiting Approval before we lock it", replaceValue: "// Evaluate if the status should actually be In Progress before we lock it" },
  { searchValue: "const resolvedStatus = (currentStatus === 'Pending' && allFields) ? 'Awaiting Approval' : currentStatus;", replaceValue: "const resolvedStatus = (currentStatus === 'Pending' && allFields) ? 'In Progress' : currentStatus;" },
  { searchValue: "if (newLocked && resolvedStatus === 'Awaiting Approval') updated.status = 'In Progress';\n        else if (!newLocked && resolvedStatus === 'In Progress') updated.status = 'Awaiting Approval';", replaceValue: "if (!newLocked && resolvedStatus === 'In Progress') updated.status = 'Pending';" },
  { searchValue: "if (currentStatus === 'Pending' && finalDate && finalSupervisor && finalAuditor1 && finalAuditor2)\n          updates.status = 'Awaiting Approval';", replaceValue: "if (currentStatus === 'Pending' && finalDate && finalSupervisor && finalAuditor1 && finalAuditor2) {\n          updates.status = 'In Progress';\n          updates.isLocked = true;\n        }" },
  { searchValue: "else if ((currentStatus === 'In Progress' || currentStatus === 'Awaiting Approval') && (!finalDate || !finalSupervisor || !finalAuditor1 || !finalAuditor2))\n          updates.status = 'Pending';", replaceValue: "else if (currentStatus === 'In Progress' && (!finalDate || !finalSupervisor || !finalAuditor1 || !finalAuditor2)) {\n          updates.status = 'Pending';\n        }" },
  { searchValue: "if (currentStatus === 'Pending' && date && audit.supervisorId && audit.auditor1Id && audit.auditor2Id)\n          updates.status = 'Awaiting Approval';", replaceValue: "if (currentStatus === 'Pending' && date && audit.supervisorId && audit.auditor1Id && audit.auditor2Id) {\n          updates.status = 'In Progress';\n          updates.isLocked = true;\n        }" },
  { searchValue: "else if ((currentStatus === 'In Progress' || currentStatus === 'Awaiting Approval') && (!date || !audit.supervisorId || !audit.auditor1Id || !audit.auditor2Id))\n          updates.status = 'Pending';", replaceValue: "else if (currentStatus === 'In Progress' && (!date || !audit.supervisorId || !audit.auditor1Id || !audit.auditor2Id)) {\n          updates.status = 'Pending';\n        }" },
  { searchValue: "if ((updated.status === 'In Progress' || updated.status === 'Awaiting Approval') && (!updated.date || !updated.supervisorId || !updated.auditor1Id || !updated.auditor2Id)) {", replaceValue: "if (updated.status === 'In Progress' && (!updated.date || !updated.supervisorId || !updated.auditor1Id || !updated.auditor2Id)) {" },
  { searchValue: "} else if ((updated.status === 'In Progress' || updated.status === 'Awaiting Approval') && (!updated.date || !updated.supervisorId || !updated.auditor1Id || !updated.auditor2Id)) {", replaceValue: "} else if (updated.status === 'In Progress' && (!updated.date || !updated.supervisorId || !updated.auditor1Id || !updated.auditor2Id)) {" },
  { searchValue: "updated.status = 'Awaiting Approval';", replaceValue: "updated.status = 'In Progress';\n          updated.isLocked = true;" }
]);

console.log('Replacements completed for useAuditActions.');
