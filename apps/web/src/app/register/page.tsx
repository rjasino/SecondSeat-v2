'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setGlobalError('');
    setLoading(true);

    const form = e.currentTarget;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    const confirmPassword = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, confirmPassword }),
      });

      if (res.status === 201) {
        router.push('/');
        return;
      }

      const data = (await res.json()) as {
        error?: string;
        errors?: { field: string; message: string }[];
      };

      if (res.status === 409) {
        setErrors({ email: data.error ?? 'Email already registered.' });
      } else if (res.status === 422 && data.errors) {
        const fieldErrors: Record<string, string> = {};
        for (const err of data.errors) {
          fieldErrors[err.field] = err.message;
        }
        setErrors(fieldErrors);
      } else {
        setGlobalError('Something went wrong. Please try again.');
      }
    } catch {
      setGlobalError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 px-8 py-8">
        <h1 className="mb-6 text-xl font-semibold tracking-tight text-neutral-100">Create account</h1>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Name" id="name" name="name" type="text" autoComplete="name" placeholder="Your name" error={errors['name']} />
          <Field label="Email" id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" error={errors['email']} />
          <Field label="Password" id="password" name="password" type="password" autoComplete="new-password" placeholder="Min 8 characters" error={errors['password']} />
          <Field label="Confirm password" id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" placeholder="••••••••" error={errors['confirmPassword']} />

          {globalError && <p className="text-xs text-red-400">{globalError}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-lg bg-neutral-700 py-2 text-sm font-medium text-neutral-100 transition hover:bg-neutral-600 disabled:opacity-50"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-neutral-600">
          Already have an account?{' '}
          <a href="/login" className="text-neutral-400 underline hover:text-neutral-200">
            Sign in
          </a>
        </p>
      </div>
    </main>
  );
}

interface FieldProps {
  label: string;
  id: string;
  name: string;
  type: string;
  autoComplete?: string;
  placeholder?: string;
  error?: string;
}

function Field({ label, id, name, type, autoComplete, placeholder, error }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-neutral-400">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-neutral-500"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
