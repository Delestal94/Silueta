import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

/**
 * Turns a thrown error into a response.
 *
 * Routes used to answer every failure with 400 "Petición inválida", so a
 * missing environment variable in production looked identical to a user
 * typing something wrong — and nothing reached the logs. Bad input is the
 * only 400; anything else is ours, and gets logged.
 */
export function errorResponse(context: string, error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 });
  }

  console.error(`[${context}]`, error);

  return NextResponse.json(
    { error: 'Error del servidor. Revisá los logs del despliegue.' },
    { status: 500 }
  );
}
