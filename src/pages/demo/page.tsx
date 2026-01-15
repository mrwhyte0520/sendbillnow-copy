import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

type FormValues = {
  fullName: string;
  email: string;
  phone: string;
  businessName: string;
  location: string;
  businessType: string;
  businessDescription: string;
};

type FormErrors = Partial<Record<keyof FormValues, string>>;

const BUSINESS_TYPES = [
  'Retail / Store',
  'Restaurant / Food',
  'Beauty / Salon',
  'Pharmacy',
  'Services',
  'Other',
];

const BUSINESS_DESCRIPTIONS = [
  'I need faster billing and checkout',
  'I want to control inventory and purchases',
  'I need reports (sales, margins, cash closing)',
  'I want to centralize billing + POS in one system',
  'Other',
];

export default function DemoPage() {
  const [values, setValues] = useState<FormValues>({
    fullName: '',
    email: '',
    phone: '',
    businessName: '',
    location: '',
    businessType: '',
    businessDescription: '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const isFormDisabled = isSubmitting || isSuccess;

  const validate = (v: FormValues) => {
    const next: FormErrors = {};

    if (!v.fullName.trim()) next.fullName = 'Please enter your first and last name.';
    if (!v.email.trim()) next.email = 'Please enter your email.';
    if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) next.email = 'Please enter a valid email.';
    if (!v.phone.trim()) next.phone = 'Please enter your phone number.';
    if (!v.businessType.trim()) next.businessType = 'Please select a business type.';

    return next;
  };

  const onChange = (key: keyof FormValues) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const next = { ...values, [key]: e.target.value };
    setValues(next);
    if (serverError) setServerError('');
    if (errors[key]) {
      const nextErrors = { ...errors };
      delete nextErrors[key];
      setErrors(nextErrors);
    }
  };

  const errorSummaryId = 'demo-form-error-summary';

  const errorSummary = useMemo(() => {
    const list = Object.values(errors).filter(Boolean) as string[];
    if (serverError) list.unshift(serverError);
    return list;
  }, [errors, serverError]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isFormDisabled) return;

    setServerError('');
    const nextErrors = validate(values);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      const el = document.getElementById(errorSummaryId);
      if (el) el.focus();
      return;
    }

    const payload = {
      full_name: values.fullName.trim().slice(0, 140),
      email: values.email.trim().toLowerCase().slice(0, 254),
      phone: values.phone.trim().slice(0, 60),
      business_name: values.businessName.trim() ? values.businessName.trim().slice(0, 160) : null,
      location: values.location.trim() ? values.location.trim().slice(0, 140) : null,
      business_type: values.businessType.trim().slice(0, 80),
      description: values.businessDescription.trim() ? values.businessDescription.trim().slice(0, 200) : null,
      message: null,
      honeypot: '',
    };

    setIsSubmitting(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '';

      const resp = await fetch(`${apiBase}/api/demo-request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await resp.json().catch(() => null);
      if (resp.ok && data && data.success === true) {
        setIsSuccess(true);
        return;
      }

      const msg = (data && typeof data.error === 'string' && data.error.trim())
        ? data.error.trim()
        : 'Something went wrong. Please try again.';
      setServerError(msg);
      const el = document.getElementById(errorSummaryId);
      if (el) el.focus();
    } catch {
      setServerError('Network error. Please try again.');
      const el = document.getElementById(errorSummaryId);
      if (el) el.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF3]">
      <header className="border-b border-[#E7DFC8] bg-white/70 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link to="/" className="font-bold text-[#008000] text-xl" style={{ fontFamily: '"Pacifico", serif' }}>
            Send Bill Now
          </Link>
          <Link
            to="/"
            className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold text-[#2B2A22] bg-gradient-to-b from-white to-[#F6F0DE] border border-[#E7DFC8] shadow-[0_6px_0_0_#E7DFC8] hover:translate-y-[-1px] hover:shadow-[0_7px_0_0_#E7DFC8] active:translate-y-[1px] active:shadow-[0_4px_0_0_#E7DFC8] transition"
          >
            Back to main site
          </Link>
        </div>
      </header>

      <main>
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#D7CBAF] bg-gradient-to-b from-white to-[#F6F0DE] px-3 py-1 text-sm text-[#3B4A2A] shadow-[0_6px_0_0_#E7DFC8]">
                <span className="w-2 h-2 rounded-full bg-[#008000]" aria-hidden="true" />
                POS Demo Request
              </div>

              <h1 className="mt-5 text-3xl sm:text-4xl font-bold tracking-tight text-[#1F2616]">
                Request a free demo of Send Bill Now
              </h1>

              <p className="mt-4 text-base sm:text-lg text-[#3A3A33] leading-relaxed">
                See how our POS helps you invoice in seconds, take payments faster, get clear reports, and keep sales and inventory
                under control from one place.
              </p>

              <div className="mt-6 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#008000]/10 text-[#008000]" aria-hidden="true">
                    <i className="ri-check-line" />
                  </span>
                  <p className="text-[#2B2A22]">No commitment: just a demo to see if it fits your business.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#008000]/10 text-[#008000]" aria-hidden="true">
                    <i className="ri-check-line" />
                  </span>
                  <p className="text-[#2B2A22]">Online demo: we guide you step-by-step and answer your questions.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#008000]/10 text-[#008000]" aria-hidden="true">
                    <i className="ri-check-line" />
                  </span>
                  <p className="text-[#2B2A22]">Support included: we’ll help you through the evaluation.</p>
                </div>
              </div>

              <div className="mt-8 rounded-2xl border border-[#E7DFC8] bg-gradient-to-b from-white to-[#FDFBF3] p-5 shadow-[0_14px_40px_rgba(31,38,22,0.10)]">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-b from-[#0A8A0A] to-[#006B00] text-white shadow-[0_10px_0_0_#D8CBB5]" aria-hidden="true">
                    <i className="ri-time-line text-xl" />
                  </span>
                  <div>
                    <p className="font-semibold text-[#1F2616]">What happens next?</p>
                    <p className="text-sm text-[#3A3A33]">
                      When you submit the form, our team will contact you to coordinate a date and show you how the POS fits your operation.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#E7DFC8] bg-gradient-to-b from-white to-[#FDFBF3] shadow-[0_18px_55px_rgba(31,38,22,0.12)] overflow-hidden">
              <div className="p-6 sm:p-8 bg-gradient-to-br from-[#008000]/12 via-white to-[#FDFBF3]">
                <h2 className="text-xl font-bold text-[#1F2616]">Request your free demo</h2>
                <p className="mt-1 text-sm text-[#3A3A33]">Fields marked with * are required.</p>
              </div>

              <form onSubmit={onSubmit} className="p-6 sm:p-8 space-y-5" noValidate>
                {errorSummary.length > 0 && (
                  <div
                    id={errorSummaryId}
                    tabIndex={-1}
                    className="rounded-xl border border-[#D28A8A] bg-[#F9D9D9] p-4 text-[#3D1F1F] outline-none"
                    role="alert"
                    aria-live="polite"
                  >
                    <p className="font-semibold">Please review the form:</p>
                    <ul className="mt-2 list-disc pl-5 text-sm">
                      {errorSummary.map((m, i) => (
                        <li key={`${m}-${i}`}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {isSuccess && (
                  <div className="rounded-xl border border-[#C4E09D] bg-[#E1F3C9] p-4 text-[#1F2616]" role="status" aria-live="polite">
                    <p className="font-semibold">Request received!</p>
                    <p className="text-sm mt-1">We’ll contact you soon to schedule your demo.</p>
                    <div className="mt-3">
                      <Link
                        to="/"
                        className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold bg-gradient-to-b from-white to-[#F6F8ED] border border-[#C4E09D] shadow-[0_6px_0_0_#C4E09D] hover:translate-y-[-1px] hover:shadow-[0_7px_0_0_#C4E09D] active:translate-y-[1px] active:shadow-[0_4px_0_0_#C4E09D] transition"
                      >
                        Return to main landing
                      </Link>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label htmlFor="fullName" className="block text-sm font-semibold text-[#1F2616]">
                      First and last name*
                    </label>
                    <input
                      id="fullName"
                      name="fullName"
                      type="text"
                      value={values.fullName}
                      onChange={onChange('fullName')}
                      disabled={isFormDisabled}
                      aria-invalid={Boolean(errors.fullName)}
                      aria-describedby={errors.fullName ? 'fullName-error' : undefined}
                      className="mt-1 w-full rounded-lg border border-[#D8CBB5] bg-gradient-to-b from-white to-[#FDFBF3] px-3 py-2 text-[#1F2616] placeholder:text-[#6B6A61] shadow-[inset_0_2px_0_0_rgba(255,255,255,0.9)] focus:outline-none focus:ring-2 focus:ring-[#008000]/35 focus:border-[#008000] hover:shadow-[0_10px_28px_rgba(31,38,22,0.10)] transition"
                      placeholder="e.g., Ana Perez"
                      autoComplete="name"
                      required
                    />
                    {errors.fullName && (
                      <p id="fullName-error" className="mt-1 text-sm text-[#8F3D3D]">
                        {errors.fullName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-semibold text-[#1F2616]">
                      Email*
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      value={values.email}
                      onChange={onChange('email')}
                      disabled={isFormDisabled}
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={errors.email ? 'email-error' : undefined}
                      className="mt-1 w-full rounded-lg border border-[#D8CBB5] bg-gradient-to-b from-white to-[#FDFBF3] px-3 py-2 text-[#1F2616] placeholder:text-[#6B6A61] shadow-[inset_0_2px_0_0_rgba(255,255,255,0.9)] focus:outline-none focus:ring-2 focus:ring-[#008000]/35 focus:border-[#008000] hover:shadow-[0_10px_28px_rgba(31,38,22,0.10)] transition"
                      placeholder="you@business.com"
                      autoComplete="email"
                      required
                    />
                    {errors.email && (
                      <p id="email-error" className="mt-1 text-sm text-[#8F3D3D]">
                        {errors.email}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="phone" className="block text-sm font-semibold text-[#1F2616]">
                      Phone*
                    </label>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      value={values.phone}
                      onChange={onChange('phone')}
                      disabled={isFormDisabled}
                      aria-invalid={Boolean(errors.phone)}
                      aria-describedby={errors.phone ? 'phone-error' : undefined}
                      className="mt-1 w-full rounded-lg border border-[#D8CBB5] bg-gradient-to-b from-white to-[#FDFBF3] px-3 py-2 text-[#1F2616] placeholder:text-[#6B6A61] shadow-[inset_0_2px_0_0_rgba(255,255,255,0.9)] focus:outline-none focus:ring-2 focus:ring-[#008000]/35 focus:border-[#008000] hover:shadow-[0_10px_28px_rgba(31,38,22,0.10)] transition"
                      placeholder="e.g., +1 809 000 0000"
                      autoComplete="tel"
                      required
                    />
                    {errors.phone && (
                      <p id="phone-error" className="mt-1 text-sm text-[#8F3D3D]">
                        {errors.phone}
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="businessName" className="block text-sm font-semibold text-[#1F2616]">
                      Business name
                    </label>
                    <input
                      id="businessName"
                      name="businessName"
                      type="text"
                      value={values.businessName}
                      onChange={onChange('businessName')}
                      disabled={isFormDisabled}
                      className="mt-1 w-full rounded-lg border border-[#D8CBB5] bg-gradient-to-b from-white to-[#FDFBF3] px-3 py-2 text-[#1F2616] placeholder:text-[#6B6A61] shadow-[inset_0_2px_0_0_rgba(255,255,255,0.9)] focus:outline-none focus:ring-2 focus:ring-[#008000]/35 focus:border-[#008000] hover:shadow-[0_10px_28px_rgba(31,38,22,0.10)] transition"
                      placeholder="e.g., Corner Market"
                      autoComplete="organization"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="location" className="block text-sm font-semibold text-[#1F2616]">
                      Location (country/city)
                    </label>
                    <input
                      id="location"
                      name="location"
                      type="text"
                      value={values.location}
                      onChange={onChange('location')}
                      disabled={isFormDisabled}
                      className="mt-1 w-full rounded-lg border border-[#D8CBB5] bg-gradient-to-b from-white to-[#FDFBF3] px-3 py-2 text-[#1F2616] placeholder:text-[#6B6A61] shadow-[inset_0_2px_0_0_rgba(255,255,255,0.9)] focus:outline-none focus:ring-2 focus:ring-[#008000]/35 focus:border-[#008000] hover:shadow-[0_10px_28px_rgba(31,38,22,0.10)] transition"
                      placeholder="e.g., Santo Domingo, DR"
                      autoComplete="address-level2"
                    />
                  </div>

                  <div>
                    <label htmlFor="businessType" className="block text-sm font-semibold text-[#1F2616]">
                      Business type
                    </label>
                    <select
                      id="businessType"
                      name="businessType"
                      value={values.businessType}
                      onChange={onChange('businessType')}
                      disabled={isFormDisabled}
                      className="mt-1 w-full rounded-lg border border-[#D8CBB5] bg-gradient-to-b from-white to-[#FDFBF3] px-3 py-2 text-[#1F2616] shadow-[inset_0_2px_0_0_rgba(255,255,255,0.9)] focus:outline-none focus:ring-2 focus:ring-[#008000]/35 focus:border-[#008000] hover:shadow-[0_10px_28px_rgba(31,38,22,0.10)] transition"
                    >
                      <option value="">Select…</option>
                      {BUSINESS_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="businessDescription" className="block text-sm font-semibold text-[#1F2616]">
                      What best describes you?
                    </label>
                    <select
                      id="businessDescription"
                      name="businessDescription"
                      value={values.businessDescription}
                      onChange={onChange('businessDescription')}
                      disabled={isFormDisabled}
                      className="mt-1 w-full rounded-lg border border-[#D8CBB5] bg-gradient-to-b from-white to-[#FDFBF3] px-3 py-2 text-[#1F2616] shadow-[inset_0_2px_0_0_rgba(255,255,255,0.9)] focus:outline-none focus:ring-2 focus:ring-[#008000]/35 focus:border-[#008000] hover:shadow-[0_10px_28px_rgba(31,38,22,0.10)] transition"
                    >
                      <option value="">Select…</option>
                      {BUSINESS_DESCRIPTIONS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isFormDisabled}
                  className={`w-full rounded-lg px-4 py-3 font-semibold text-white transition transform ${
                    isFormDisabled
                      ? 'bg-[#008000]/60 cursor-not-allowed shadow-none'
                      : 'bg-gradient-to-b from-[#0A8A0A] to-[#006B00] shadow-[0_10px_0_0_#D8CBB5] hover:translate-y-[-1px] hover:shadow-[0_12px_0_0_#D8CBB5] active:translate-y-[1px] active:shadow-[0_7px_0_0_#D8CBB5]'
                  }`}
                >
                  {isSubmitting ? 'Submitting…' : isSuccess ? 'Submitted' : 'Request Demo'}
                </button>

                <p className="text-xs text-[#6B6A61] leading-relaxed">
                  By requesting a demo, you agree that we may contact you by email or phone about Send Bill Now.
                </p>
              </form>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E7DFC8] bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-[#6B6A61]">© 2024 Send Bill Now</p>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm font-semibold text-[#008000] hover:underline">
              Back to main landing
            </Link>
            <Link to="/auth/register" className="text-sm font-semibold text-[#1F2616] hover:underline">
              Start free trial
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
