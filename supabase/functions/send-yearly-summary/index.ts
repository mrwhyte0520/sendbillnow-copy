import '@supabase/functions-js/edge-runtime.d.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createServiceRoleClient, jsonResponse, getPreviousYearRange, fetchCompanyBranding, fetchInvoicesInRange, groupInvoicesByCustomer, buildYearlySummaryPdf, sanitizeFileName, sendEmailWithPdf } from '../_shared/reporting.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const reportDate = body?.reportDate ? new Date(body.reportDate) : new Date();
    const range = getPreviousYearRange(reportDate);
    const supabase = createServiceRoleClient();
    const invoices = await fetchInvoicesInRange(supabase, range);
    const grouped = groupInvoicesByCustomer(invoices);

    let sent = 0;
    const errors: string[] = [];

    for (const group of grouped) {
      try {
        const company = await fetchCompanyBranding(supabase, group.userId);
        const pdfBytes = await buildYearlySummaryPdf({
          company,
          customer: group.customer,
          invoices: group.invoices,
          periodLabel: range.label,
        });

        await sendEmailWithPdf({
          to: group.customer.email,
          subject: 'Your Annual Invoice Summary – SendBillNow',
          html: `<p>Hello ${group.customer.name},</p><p>Please find attached your annual invoice summary for ${range.label}.</p><p>Sent from SendBillNow.</p>`,
          text: `Hello ${group.customer.name},\n\nPlease find attached your annual invoice summary for ${range.label}.\n\nSent from SendBillNow.`,
          pdfBytes,
          filename: `${sanitizeFileName(group.customer.name)}-annual-summary-${range.year}.pdf`,
        });

        sent += 1;
      } catch (error) {
        errors.push(`Customer ${group.customer.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return jsonResponse({
      success: true,
      period: range.label,
      customersProcessed: grouped.length,
      emailsSent: sent,
      errors,
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
