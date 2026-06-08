import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { Bindings, Variables } from '../types';

const ai = new Hono<{ Bindings: Bindings, Variables: Variables }>();

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// Strip markdown code fences that some models wrap JSON in
const stripFences = (text: string) => text.trim().replace(/^```json\n?|\n?```$/g, '').trim();

ai.post('/analyze', zValidator('json', z.object({ schedules: z.array(z.any()) })), async (c) => {
  const { schedules } = c.req.valid('json');
  const activeSchedules = schedules.filter((s: any) => s.status !== 'Completed');
  const scheduleText = activeSchedules.map((s: any) =>
    `- [${s.date || 'Unscheduled'}] ${s.departmentId} (${s.locationId}): ${
      !s.auditor1Id && !s.auditor2Id ? 'NO AUDITORS' :
      (s.auditor1Id ? '1' : '0') + (s.auditor2Id ? '+1' : '') + ' assigned'
    }`
  ).join('\n');

  try {
    const result = await c.env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: 'You are a Movable Asset Inspection Analyst. Respond with valid JSON only, no markdown fences.' },
        { role: 'user', content: `Analyze the following inspection schedule (Pending/In Progress). Today is ${new Date().toISOString().split('T')[0]}.

Identify:
1. Immediate Risks: Unassigned slots for upcoming dates.
2. Bottlenecks: Departments with disproportionately high pending counts.
3. Compliance Gaps: Locations with zero inspecting officers assigned.

Return ONLY a JSON object:
{ "summary": "<1-sentence risk level summary>", "recommendations": ["<action 1>", "<action 2>", "<action 3>"] }

Data:
${scheduleText}` }
      ]
    }) as { response: string };

    const parsed = JSON.parse(stripFences(result.response));
    return c.json({
      summary: parsed.summary || 'Analysis complete.',
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : []
    });
  } catch {
    return c.json({
      summary: 'The AI assistant is currently offline.',
      recommendations: ['Check manual schedule for conflicts.', 'Ensure all high-priority locations have auditors.', 'Verify certification status of team members.']
    });
  }
});

ai.post('/search', zValidator('json', z.object({ query: z.string(), validDepartments: z.array(z.string()) })), async (c) => {
  const { query, validDepartments } = c.req.valid('json');

  try {
    const result = await c.env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: 'You are a search query parser. Respond with valid JSON only, no markdown fences.' },
        { role: 'user', content: `Map this search query to filters.

Query: "${query}"
Valid departments: ${JSON.stringify(validDepartments)}

Rules:
- department: match exactly one from the list or "All"
- status: "Pending", "In Progress", "Completed", or "All"
- text: any specific name or location mentioned

Return ONLY: { "department": "...", "status": "...", "text": "..." }` }
      ]
    }) as { response: string };

    return c.json(JSON.parse(stripFences(result.response)));
  } catch {
    return c.json({ department: 'All', status: 'All', text: query });
  }
});

ai.post('/report', zValidator('json', z.object({ audit: z.any(), resolvedData: z.any().optional() })), async (c) => {
  const { audit, resolvedData } = c.req.valid('json');

  const locName = resolvedData?.locationName || audit.locationId;
  const deptName = resolvedData?.departmentName || audit.departmentId;
  const a1Name = resolvedData?.auditor1Name || audit.auditor1Id || 'N/A';
  const a2Name = resolvedData?.auditor2Name || audit.auditor2Id || 'N/A';
  const supName = resolvedData?.supervisorName || audit.supervisorId;

  try {
    const result = await c.env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: 'You are a formal document writer for government asset inspections. Use plain text only, no markdown.' },
        { role: 'user', content: `Generate a formal "Movable Asset Inspection Report" for this completed inspection.

Context:
- Location: ${locName}
- Department: ${deptName}
- Date Completed: ${audit.date}
- Auditors: ${a1Name} and ${a2Name}
- Supervisor (Site): ${supName}

Format:
- Start with "OFFICIAL MOVABLE ASSET INSPECTION RECORD" as the header.
- Include a "Certification Statement" declaring the assets verified.
- Include a "Scope of Verification" section.
- End with a "Digital Signature" placeholder.
- Highly professional, bureaucratic tone. Plain text only, no bold or italics.` }
      ]
    }) as { response: string };

    return c.json({ report: result.response || 'Report generation failed.' });
  } catch (err) {
    console.error('Report generation failed:', err);
    return c.json({ report: 'Error: Could not generate report at this time.' }, 500);
  }
});

ai.post('/suggest-thresholds', zValidator('json', z.object({ departments: z.array(z.any()) })), async (c) => {
  const { departments } = c.req.valid('json');
  const deptData = departments
    .filter(d => !d.isExempted && (d.totalAssets || 0) > 0)
    .map(d => `${d.name}: ${d.totalAssets} assets`)
    .join('\n');

  try {
    const result = await c.env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: 'You are an Audit Strategy AI. Analyze asset distribution and suggest optimal thresholds for standalone vs consolidated audits. Respond with valid JSON only.' },
        { role: 'user', content: `Analyze this department asset distribution and suggest two values:
1. assetThreshold: The minimum assets for a department to be "Standalone" (not consolidated).
2. megaTargetThreshold: The maximum assets before a department is considered a "Mega Target" (needs extra auditors).

Goal: Balance the workload so roughly 30-40% of departments are standalone, and only the top 5-10% are mega targets.

Data:
${deptData}

Return ONLY: { "assetThreshold": number, "megaTargetThreshold": number, "reasoning": "string" }` }
      ]
    }) as { response: string };

    const parsed = JSON.parse(stripFences(result.response));
    return c.json(parsed);
  } catch (err) {
    console.error('Threshold suggestion failed:', err);
    // Fallback to reasonable defaults if AI fails
    return c.json({ assetThreshold: 500, megaTargetThreshold: 3000, reasoning: "Fallback defaults due to AI offline." });
  }
});

export const aiRoutes = ai;
