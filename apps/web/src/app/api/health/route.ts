import { NextResponse } from 'next/server';
import { z } from 'zod';

const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('web'),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export async function GET() {
  const payload = HealthResponseSchema.parse({
    status: 'ok',
    service: 'web',
    timestamp: new Date().toISOString(),
  });
  return NextResponse.json(payload, { status: 200 });
}
