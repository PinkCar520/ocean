'use client';

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-6">
      <section className="max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-foreground">Ocean 暂时无法连接服务</h1>
        <p className="mt-3 text-sm text-muted-foreground">请确认 Gateway 正常运行，然后重试。</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-lg bg-primary px-5 py-2.5 font-semibold text-primary-foreground"
        >
          重试
        </button>
      </section>
    </main>
  );
}
