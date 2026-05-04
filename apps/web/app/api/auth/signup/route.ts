import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  // CSRF defense: require Origin header to match request host (blocks cross-site POSTs)
  const origin = req.headers.get('origin')
  const host = req.headers.get('host')
  if (!origin || !host) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const originHost = new URL(origin).host
    if (originHost !== host) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Rate limit: 5 signups per minute per IP
  const ip = req.headers.get('x-forwarded-for') || 'unknown'
  const { success } = rateLimit(`signup:${ip}`, 5, 60 * 1000)
  if (!success) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { name, email, password } = body

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email) || email.length > 255) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  }

  // Validate password
  if (password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: 'Password must be 8-128 characters' }, { status: 400 })
  }

  // Check if email already exists
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Account already exists' }, { status: 409 })
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12)

  // Create user
  const { error: insertError } = await supabaseAdmin
    .from('users')
    .insert({
      email: email.toLowerCase().trim(),
      name: typeof name === 'string' ? name.trim().slice(0, 100) : null,
      password_hash: passwordHash,
      plan: 'free',
    })

  if (insertError) {
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
