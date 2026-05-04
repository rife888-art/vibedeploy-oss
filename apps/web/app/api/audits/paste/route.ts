import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimit } from '@/lib/rate-limit'
import Anthropic from '@anthropic-ai/sdk'
import { waitUntil } from '@vercel/functions'

export const maxDuration = 300

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-20250514'

const AUDIT_PROMPT = `You are a senior security auditor. Your reputation depends on precision: false positives waste developers' time and erode trust. Be rigorous.

CRITICAL RULES — violating any of these makes your report worthless:
1. EVERY finding must cite a specific code pattern that proves the vulnerability. If you cannot quote the exact problematic line, do NOT report it.
2. NEVER report "missing role-based access" or "any authenticated user can do X" as a vulnerability — authentication IS the access control unless the spec says otherwise.
3. NEVER report theoretical risks. Only report exploitable issues with concrete attack paths.
4. NEVER flag standard library behavior as a vuln (e.g. Supabase JS client parameterizes queries; React escapes JSX by default; regex format checks are not auth).
5. NEVER flag intended product behavior. If the app's purpose is to let users analyze code, don't report "users can analyze code" as no-auth.
6. If the code already mitigates an issue (rate limiting present, constant-time compare present, input validation present), do NOT also flag the area as vulnerable.
7. Prefer FEWER, REAL findings over many speculative ones. 0-3 real findings is normal for a well-written codebase.

Return ONLY valid JSON in this exact format:
{
  "score": <number 0-100>,
  "grade": "<A|B|C|D|F>",
  "summary": "<2-3 sentence summary of security posture>",
  "findings": [
    {
      "severity": "critical" | "warning" | "info",
      "type": "<e.g. hardcoded-secret, no-auth, sql-injection, xss, insecure-config>",
      "file": "<file path or 'pasted code'>",
      "line": <line number or 0>,
      "description": "<what the issue is, including the exploitable scenario>",
      "fix": "<concrete fix>"
    }
  ]
}

Severity definitions (use strictly):
- critical: remote code execution, authentication bypass, plaintext secret in repo, SQL injection with proven payload path
- warning: real but limited-impact issue (missing rate limit on abusable endpoint, weak crypto choice with concrete attack)
- info: best-practice suggestion, not a vulnerability

Grading (apply honestly — do not inflate):
- A (90-100): No exploitable issues. Minor info-only suggestions OK.
- B (70-89): No critical, 1-3 warnings with real impact.
- C (50-69): 1 confirmed critical OR many warnings.
- D (30-49): 2+ confirmed criticals.
- F (0-29): Severe, obvious exploitation path.

Focus areas: hardcoded secrets in source, missing auth on endpoints that mutate data, real injection (not theoretical), XSS via dangerouslySetInnerHTML, missing rate limiting on abusable endpoints, CORS misconfig with credentials, secrets in client-side code.

Return max 10 findings. Return ONLY valid JSON.`

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success } = rateLimit(`audit-paste:${session.user.id}`, 5, 60 * 1000)
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please wait before starting another audit.' }, { status: 429 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { code, projectName } = body

  if (!code || typeof code !== 'string' || code.trim().length < 20) {
    return NextResponse.json({ error: 'Please paste at least 20 characters of code' }, { status: 400 })
  }

  // Cap code size
  const trimmedCode = code.slice(0, 100000)
  const safeName = typeof projectName === 'string' ? projectName.trim().slice(0, 100) : 'Pasted code'

  // Create audit record
  const { data: audit, error: insertError } = await supabaseAdmin
    .from('audits')
    .insert({
      user_id: session.user.id,
      repo_name: safeName,
      status: 'analyzing',
    })
    .select('id')
    .single()

  if (insertError || !audit) {
    return NextResponse.json({ error: 'Failed to create audit' }, { status: 500 })
  }

  // Run audit in background — waitUntil keeps the function alive past the response
  waitUntil(
    runPasteAudit(audit.id, trimmedCode, safeName).catch(() => {
      return supabaseAdmin.from('audits').update({ status: 'error', summary: 'Unexpected error during analysis' }).eq('id', audit.id)
    })
  )

  return NextResponse.json({ auditId: audit.id })
}

async function runPasteAudit(auditId: string, code: string, name: string) {
  try {
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: AUDIT_PROMPT,
      messages: [
        { role: 'user', content: `Audit this codebase (project: ${name}):\n\n${code}` },
      ],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}'

    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      const match = raw.match(/\{[\s\S]*\}/)
      parsed = match ? JSON.parse(match[0]) : null
    }

    if (!parsed) {
      await supabaseAdmin.from('audits').update({ status: 'error', summary: 'Failed to parse results' }).eq('id', auditId)
      return
    }

    await supabaseAdmin.from('audits').update({
      status: 'done',
      grade: parsed.grade || 'C',
      score: parsed.score || 50,
      summary: parsed.summary || 'Analysis complete',
    }).eq('id', auditId)

    if (Array.isArray(parsed.findings) && parsed.findings.length > 0) {
      const validSeverities = ['critical', 'warning', 'info']
      const findings = parsed.findings.slice(0, 15).map((f: any) => ({
        audit_id: auditId,
        severity: validSeverities.includes(f.severity) ? f.severity : 'info',
        type: typeof f.type === 'string' ? f.type.slice(0, 100) : 'unknown',
        file: typeof f.file === 'string' ? f.file.slice(0, 500) : null,
        line: typeof f.line === 'number' && f.line >= 0 ? Math.min(f.line, 999999) : null,
        description: typeof f.description === 'string' ? f.description.slice(0, 2000) : '',
        fix: typeof f.fix === 'string' ? f.fix.slice(0, 2000) : null,
      }))
      await supabaseAdmin.from('audit_findings').insert(findings)
    }
  } catch {
    await supabaseAdmin.from('audits').update({
      status: 'error',
      summary: 'An error occurred during analysis. Please try again.',
    }).eq('id', auditId)
  }
}
