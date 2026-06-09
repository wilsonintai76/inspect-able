const fs = require('fs');

function replaceFileContent(filePath, replacer) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    const newContent = replacer(content);
    if (newContent !== content) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`Updated ${filePath}`);
    }
  }
}

// 1. useAuditActions.ts
replaceFileContent('src/client/hooks/useAuditActions.ts', content => {
  return content
    .replace(/if \(newLocked && s\.status === 'Awaiting Approval'\) updated\.status = 'In Progress';\r?\n\s*else if \(!newLocked && s\.status === 'In Progress'\) updated\.status = 'In Progress';/, 
             "if (!newLocked && s.status === 'In Progress') updated.status = 'Pending';")
    .replace(/if \(updated\.status === 'Pending' && updated\.date && updated\.supervisorId && updated\.auditor1Id && updated\.auditor2Id\) \{\r?\n\s*updated\.status = 'In Progress';\r?\n\s*updated\.isLocked = true;\r?\n\s*\} else if \(updated\.status === 'In Progress' && \(!updated\.date \|\| !updated\.supervisorId \|\| !updated\.auditor1Id \|\| !updated\.auditor2Id\)\) \{\r?\n\s*updated\.status = 'Pending';\r?\n\s*\}/,
             "if (updated.status === 'Pending' && updated.date && updated.supervisorId && updated.auditor1Id && updated.auditor2Id) {\n          updated.status = 'In Progress';\n          updated.isLocked = true;\n        } else if (updated.status === 'In Progress' && (!updated.date || !updated.supervisorId || !updated.auditor1Id || !updated.auditor2Id)) {\n          updated.status = 'Pending';\n        }")
    .replace(/if \(currentStatus === 'Pending' && finalDate && finalSupervisor && finalAuditor1 && finalAuditor2\)\r?\n\s*updates\.status = 'Awaiting Approval';\r?\n\s*else if \(\(currentStatus === 'In Progress' \|\| currentStatus === 'Awaiting Approval'\) && \(!finalDate \|\| !finalSupervisor \|\| !finalAuditor1 \|\| !finalAuditor2\)\)\r?\n\s*updates\.status = 'Pending';/g,
             "if (currentStatus === 'Pending' && finalDate && finalSupervisor && finalAuditor1 && finalAuditor2) {\n          updates.status = 'In Progress';\n          updates.isLocked = true;\n        } else if (currentStatus === 'In Progress' && (!finalDate || !finalSupervisor || !finalAuditor1 || !finalAuditor2)) {\n          updates.status = 'Pending';\n        }")
    .replace(/if \(currentStatus === 'Pending' && date && audit\.supervisorId && audit\.auditor1Id && audit\.auditor2Id\)\r?\n\s*updates\.status = 'Awaiting Approval';\r?\n\s*else if \(\(currentStatus === 'In Progress' \|\| currentStatus === 'Awaiting Approval'\) && \(!date \|\| !audit\.supervisorId \|\| !audit\.auditor1Id \|\| !audit\.auditor2Id\)\)\r?\n\s*updates\.status = 'Pending';/g,
             "if (currentStatus === 'Pending' && date && audit.supervisorId && audit.auditor1Id && audit.auditor2Id) {\n          updates.status = 'In Progress';\n          updates.isLocked = true;\n        } else if (currentStatus === 'In Progress' && (!date || !audit.supervisorId || !audit.auditor1Id || !audit.auditor2Id)) {\n          updates.status = 'Pending';\n        }")
    .replace(/showToast\(willStart \? 'Assigned! Awaiting supervisor approval\.' : 'Assigned'\);/g,
             "showToast(willStart ? 'Assigned and scheduled!' : 'Assigned');");
});

// 2. emailService.ts
replaceFileContent('src/server/services/emailService.ts', content => {
  return content
    .replace(/An inspection schedule is awaiting your approval/g, "An inspection has been assigned to you")
    .replace(/An inspection has been fully scheduled and is awaiting your confirmation before it can officially begin\./g, "An inspection has been fully scheduled and is now In Progress.")
    .replace(/An inspection is scheduled in 2 days and still awaiting your approval/g, "An inspection is scheduled in 2 days and requires your attention")
    .replace(/is still awaiting your approval\./g, "is scheduled and requires your attention.");
});

// 3. auditMaintenanceService.ts
replaceFileContent('src/server/services/auditMaintenanceService.ts', content => {
  return content
    .replace(/if \(audit\.status === 'Awaiting Approval' \|\| audit\.status === 'In Progress'\) newStatus = 'Pending';/g, "if (audit.status === 'In Progress') newStatus = 'Pending';")
    .replace(/Pending, Awaiting Approval, In Progress/g, "Pending, In Progress");
});

// 4. db.shared.ts
replaceFileContent('src/server/routes/db.shared.ts', content => {
  return content.replace(/'Awaiting Approval':\s*\['Pending', 'In Progress'\],?\r?\n/g, "");
});

// 5. db.audits.ts
replaceFileContent('src/server/routes/db.audits.ts', content => {
  return content
    .replace(/\} else if \(currentStatus === 'In Progress' \|\| currentStatus === 'Awaiting Approval'\) \{/g, "} else if (currentStatus === 'In Progress') {")
    .replace(/if \(audit\.status !== 'Awaiting Approval'\) return c\.json\(\{ error: 'Audit is not awaiting approval' \}, 400\);/g, "");
});

// 6. InstitutionalSection.tsx
replaceFileContent('src/client/components/dashboard/InstitutionalSection.tsx', content => {
  return content
    .replace(/\r?\n\s*awaitingApproval: activeSchedules\.filter\(s => false \/\* Removed Awaiting Approval \*\/\)\.length,/g, "")
    .replace(/\r?\n\s*const awaiting = 0;/g, "")
    .replace(/\r?\n\s*awaiting,/g, "")
    .replace(/ - auditStats\.awaitingApproval/g, "")
    .replace(/\r?\n\s*Awaiting \{auditStats\.awaitingApproval\}/g, "")
    .replace(/\r?\n\s*<div className="flex items-center gap-1">\r?\n\s*<div className="w-2 h-2 rounded-full bg-orange-500"><\/div>\r?\n\s*<span className="font-bold text-orange-500">Awaiting<\/span> — ready, waiting supervisor approval\r?\n\s*<\/div>/g, "")
    .replace(/\r?\n\s*<span className="text-\[10px\] text-slate-400 font-bold">\{pendingApprovals\.length\} awaiting<\/span>/g, "")
    .replace(/pendingApprovals\.length > 0 \? `${pendingApprovals\.length} awaiting` : /g, "")
    .replace(/\r?\n\s*\.filter\(s => false \/\* Removed Awaiting Approval \*\/\)/g, "");
});

// 7. InspectionStatusTable.tsx
replaceFileContent('src/client/components/dashboard/widgets/InspectionStatusTable.tsx', content => {
  return content
    .replace(/\r?\n\s*awaiting: number;/g, "")
    .replace(/\r?\n\s*<th className="px-2 py-3 text-\[10px\] font-black uppercase text-orange-500 text-center">Awaiting<\/th>/g, "")
    .replace(/\r?\n\s*<td className="px-2 py-3 text-center font-bold text-orange-500">\{d\.awaiting\}<\/td>/g, "")
    .replace(/\r?\n\s*\{d\.awaiting > 0 && \(\r?\n\s*<div\r?\n\s*className="h-full bg-orange-500 border-r border-slate-700\/50"\r?\n\s*style=\{\{ width: `\$\{\(d\.awaiting \/ d\.locs\) \* 100\}%` \}\}\r?\n\s*title=\{`\$\{d\.awaiting\} awaiting approval`\}\r?\n\s*\/>\r?\n\s*\)\}/g, "");
});

// 8. KioskApp.tsx
replaceFileContent('src/client/apps/kiosk/KioskApp.tsx', content => {
  return content
    .replace(/\r?\n\s*let awaitingApproval = 0;/g, "")
    .replace(/\r?\n\s*else if \(s\.status === 'Awaiting Approval'\) awaitingApproval\+\+;/g, "")
    .replace(/, awaitingApproval /g, " ")
    .replace(/\r?\n\s*const awaiting = 0;/g, "")
    .replace(/\r?\n\s*awaiting,/g, "")
    .replace(/ - auditStats\.awaitingApproval/g, "")
    .replace(/\r?\n\s*Awaiting \{auditStats\.awaitingApproval\}/g, "")
    .replace(/\r?\n\s*\{d\.awaiting > 0 && <Tag color="warning" style=\{\{ margin: 0, fontSize: 13, padding: '2px 10px' \}\}>⏳ \{d\.awaiting\}<\/Tag>\}/g, "")
    .replace(/ && d\.awaiting === 0/g, "")
    .replace(/\r?\n\s*<Col span=\{6\}>\r?\n\s*<div style=\{\{ display: 'flex', flexDirection: 'column', alignItems: 'center' \}\}>\r?\n\s*<div style=\{\{ fontSize: 26, fontWeight: 900, color: '#fa8c16' \}\}>\{d\.awaiting\}<\/div>\r?\n\s*<div style=\{\{ fontSize: 14, color: '#555', fontWeight: 600 \}\}>Awaiting<\/div>\r?\n\s*<\/div>\r?\n\s*<\/Col>/g, "")
    .replace(/\r?\n\s*extra=\{<Tag color="warning">\{pendingApprovals\.length\} awaiting<\/Tag>\}/g, "");
});

console.log('Cleanup complete.');
