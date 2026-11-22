import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode; lang: string };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Different Store] Unhandled UI error:', error);
    console.error('[Different Store] React component stack:', info.componentStack);
  }

  render() {
    if (this.state.error) {
      const arabic = this.props.lang === 'ar';
      return <main dir={arabic ? 'rtl' : 'ltr'} className="grid min-h-screen place-items-center bg-stone-50 p-6 text-stone-900">
        <section role="alert" className="w-full max-w-lg rounded-lg border border-stone-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold">{arabic ? 'حدث خطأ غير متوقع' : 'Something went wrong'}</h1>
          <p className="mt-2 text-sm text-stone-600">{arabic ? 'تم تسجيل تفاصيل الخطأ. أعد تحميل الصفحة للمتابعة.' : 'The error details were logged. Reload the page to continue.'}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 min-h-11 rounded-md bg-stone-900 px-5 text-sm font-bold text-white">
            {arabic ? 'إعادة تحميل الصفحة' : 'Reload page'}
          </button>
        </section>
      </main>;
    }
    return this.props.children;
  }
}
