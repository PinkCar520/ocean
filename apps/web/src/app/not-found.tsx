import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-6 text-center">
      <section>
        <h1 className="text-2xl font-bold text-foreground">页面不存在</h1>
        <Link className="mt-5 inline-block font-semibold text-primary" href="/">返回 Ocean 首页</Link>
      </section>
    </main>
  );
}
