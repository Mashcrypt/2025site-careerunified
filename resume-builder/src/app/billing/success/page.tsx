export default function BillingSuccess() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md text-center">
        <h1 className="text-2xl font-bold text-slate-900">Payment successful </h1>
        <p className="text-slate-600 mt-3">
          Your subscription is now active. You can start using AI features immediately.
        </p>

        <a
          href="/resume-builder"
          className="inline-block mt-6 px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
        >
          Go back to Resume Builder
        </a>
      </div>
    </div>
  );
}
