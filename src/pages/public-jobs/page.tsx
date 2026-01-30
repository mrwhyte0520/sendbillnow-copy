import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

type PortalState = {
  portal: any;
  company: { id: string; name?: string | null } | null;
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIndex = result.indexOf(',');
      if (commaIndex >= 0) {
        resolve(result.slice(commaIndex + 1));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
};

export default function PublicJobsPage() {
  const params = useParams();
  const token = params.token as string | undefined;

  const cvInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [portalState, setPortalState] = useState<PortalState | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateRegion, setStateRegion] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [socialSecurity, setSocialSecurity] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [availabilityDate, setAvailabilityDate] = useState('');

  const [isUsCitizen, setIsUsCitizen] = useState('');
  const [isLegallyEligible, setIsLegallyEligible] = useState('');
  const [hasFelonyConviction, setHasFelonyConviction] = useState('');
  const [workedAtHudsonTrainingCenter, setWorkedAtHudsonTrainingCenter] = useState('');

  const [position, setPosition] = useState('');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successId, setSuccessId] = useState<string>('');

  const positions = useMemo(() => {
    const raw = portalState?.portal?.positions;
    if (Array.isArray(raw)) return raw.map((p) => String(p));
    return [];
  }, [portalState?.portal?.positions]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      setPortalState(null);

      if (!token) {
        setError('Invalid portal.');
        setLoading(false);
        return;
      }

      try {
        const { data, error: rpcError } = await supabase.rpc('get_job_portal_by_token', {
          job_token: String(token),
        });
        if (rpcError) throw rpcError;
        if (!data) {
          setError('Portal not found or inactive.');
          setLoading(false);
          return;
        }
        const parsed = data as any;
        const portal = parsed?.portal || null;
        const company = parsed?.company || null;
        if (!portal) {
          setError('Portal not found or inactive.');
          setLoading(false);
          return;
        }
        setPortalState({ portal, company });
        if (!position && Array.isArray(portal?.positions) && portal.positions.length > 0) {
          setPosition(String(portal.positions[0]));
        }
        if (position && (!Array.isArray(portal?.positions) || portal.positions.length === 0)) {
          setPosition('');
        }
      } catch (e: any) {
        console.error('PublicJobsPage load error', e);
        setError(e?.message || 'Could not load the portal.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submit = async () => {
    if (!token) return;
    setSuccessId('');

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !position.trim()) {
      setError('Please complete name, last name, e-mail, and position.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      let cvBase64: string | null = null;
      let cvFilename: string | null = null;
      let cvMime: string | null = null;

      if (cvFile) {
        const maxBytes = 2 * 1024 * 1024;
        if (cvFile.size > maxBytes) {
          throw new Error('The CV is too large (max 2MB).');
        }
        cvBase64 = await fileToBase64(cvFile);
        cvFilename = cvFile.name;
        cvMime = cvFile.type;
      }

      const answers = {
        firstName: firstName || null,
        lastName: lastName || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        state: stateRegion || null,
        zipCode: zipCode || null,
        socialSecurity: socialSecurity || null,
        birthdate: birthdate || null,
        availabilityDate: availabilityDate || null,
        isUsCitizen: isUsCitizen || null,
        isLegallyEligible: isLegallyEligible || null,
        hasFelonyConviction: hasFelonyConviction || null,
        workedAtHudsonTrainingCenter: workedAtHudsonTrainingCenter || null,
      };

      const fullName = `${firstName} ${lastName}`.trim();

      const { data, error: rpcError } = await supabase.rpc('submit_job_application', {
        job_token: String(token),
        p_full_name: fullName,
        p_email: email,
        p_phone: phone,
        p_position: position,
        p_answers: answers,
        p_cv_filename: cvFilename,
        p_cv_mime: cvMime,
        p_cv_base64: cvBase64,
      });

      if (rpcError) throw rpcError;
      if (!data) throw new Error('Could not submit the application');

      setSuccessId(String(data));
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
      setAddress('');
      setCity('');
      setStateRegion('');
      setZipCode('');
      setSocialSecurity('');
      setBirthdate('');
      setAvailabilityDate('');
      setIsUsCitizen('');
      setIsLegallyEligible('');
      setHasFelonyConviction('');
      setWorkedAtHudsonTrainingCenter('');
      setCvFile(null);
    } catch (e: any) {
      console.error('submit_job_application error', e);
      setError(e?.message || 'Could not submit the application');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f6f8f5] via-white to-[#f3efe7] py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[#008000] to-[#006B00] rounded-2xl mb-4">
            <i className="ri-briefcase-4-line text-3xl text-white"></i>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Job Application</h1>
          <p className="text-gray-600 mt-1">
            {portalState?.company?.name ? `${portalState.company.name}` : 'Company'}
          </p>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
            <p className="text-gray-700">Loading...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl shadow-xl border border-red-200 p-6">
            <div className="flex items-start gap-3">
              <i className="ri-error-warning-line text-red-500 text-xl mt-0.5"></i>
              <div>
                <p className="font-semibold text-red-800">Error</p>
                <p className="text-red-700">{error}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Apply now</h2>
              <p className="text-sm text-gray-600">
                Fill out the form below. If you have a CV, you can attach it.
              </p>
            </div>

            <div className="p-6 space-y-5">
              {successId ? (
                <div className="bg-[#008000]/10 border border-[#008000]/20 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <i className="ri-check-line text-[#008000] text-xl mt-0.5"></i>
                    <div>
                      <p className="font-semibold text-[#006B00]">Application submitted</p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name:</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last name(s):</label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone:</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail:</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address:</label>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City:</label>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State:</label>
                  <input
                    value={stateRegion}
                    onChange={(e) => setStateRegion(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code:</label>
                  <input
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Social Security:</label>
                  <input
                    value={socialSecurity}
                    onChange={(e) => setSocialSecurity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Birthdate:</label>
                  <input
                    type="date"
                    value={birthdate}
                    onChange={(e) => setBirthdate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Availability Date</label>
                  <input
                    type="date"
                    value={availabilityDate}
                    onChange={(e) => setAvailabilityDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="text-sm font-medium text-gray-700">Are you a United States citizen?:</div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="radio" name="isUsCitizen" value="no" checked={isUsCitizen === 'no'} onChange={(e) => setIsUsCitizen(e.target.value)} />
                      No
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="radio" name="isUsCitizen" value="yes" checked={isUsCitizen === 'yes'} onChange={(e) => setIsUsCitizen(e.target.value)} />
                      Yes
                    </label>
                  </div>

                  <div className="text-sm font-medium text-gray-700">Have you ever been convicted of a felony?:</div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="radio" name="hasFelonyConviction" value="no" checked={hasFelonyConviction === 'no'} onChange={(e) => setHasFelonyConviction(e.target.value)} />
                      No
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="radio" name="hasFelonyConviction" value="yes" checked={hasFelonyConviction === 'yes'} onChange={(e) => setHasFelonyConviction(e.target.value)} />
                      Yes
                    </label>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-sm font-medium text-gray-700">Are you legally eligible to work in the U.S.?:</div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="radio" name="isLegallyEligible" value="yes" checked={isLegallyEligible === 'yes'} onChange={(e) => setIsLegallyEligible(e.target.value)} />
                      Yes
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="radio" name="isLegallyEligible" value="no" checked={isLegallyEligible === 'no'} onChange={(e) => setIsLegallyEligible(e.target.value)} />
                      No
                    </label>
                  </div>

                  <div className="text-sm font-medium text-gray-700">Have you ever worked at Hudson Training Center?:</div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="radio" name="workedAtHudsonTrainingCenter" value="no" checked={workedAtHudsonTrainingCenter === 'no'} onChange={(e) => setWorkedAtHudsonTrainingCenter(e.target.value)} />
                      No
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="radio" name="workedAtHudsonTrainingCenter" value="yes" checked={workedAtHudsonTrainingCenter === 'yes'} onChange={(e) => setWorkedAtHudsonTrainingCenter(e.target.value)} />
                      Yes
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
                <select
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#008000] focus:border-transparent"
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {positions.length === 0 ? (
                    <option value="" disabled>
                      No positions available
                    </option>
                  ) : null}
                  {positions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CV (optional, PDF/DOC, max 2MB)</label>
                <input
                  ref={cvInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setCvFile(f);
                  }}
                  className="hidden"
                />

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => cvInputRef.current?.click()}
                    className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-800 hover:bg-gray-50"
                  >
                    Choose file
                  </button>
                  <div className="text-sm text-gray-600 truncate">
                    {cvFile ? cvFile.name : 'No file chosen'}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex flex-col md:flex-row gap-3">
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-[#0A8A0A] to-[#006B00] text-white rounded-lg font-semibold hover:from-[#097509] hover:to-[#005300] disabled:opacity-60"
                >
                  {submitting ? 'Sending...' : 'Submit application'}
                </button>
              </div>

              <p className="text-xs text-gray-500">
                By submitting, you authorize the company to contact you about this application.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
