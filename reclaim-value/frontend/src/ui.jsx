export const Btn = ({ kind = 'solid', className = '', ...p }) => (
  <button {...p} className={`px-4 py-2 font-semibold text-sm disabled:opacity-50 ${kind === 'solid' ? 'bg-ink text-white hover:bg-black' : kind === 'hivis' ? 'bg-hivis text-ink hover:brightness-95' : 'border-2 border-ink text-ink hover:bg-ink hover:text-white'} ${className}`} />
);
export const Field = ({ label, ...p }) => (
  <label className="block text-sm font-medium">{label}<input {...p} className="mt-1 w-full border-2 border-ink/30 bg-white px-3 py-2 focus:border-ink" /></label>
);
export const Panel = ({ title, children, className = '' }) => (
  <section className={`bg-white border-l-8 border-hivis p-5 ${className}`}>{title && <h2 className="font-display text-2xl mb-3">{title}</h2>}{children}</section>
);
export const Stat = ({ label, value }) => (<div className="bg-white p-4"><div className="font-display text-4xl leading-none">{value}</div><div className="text-sm text-rebar mt-1">{label}</div></div>);
export const Err = ({ msg }) => msg ? <p role="alert" className="text-red-700 text-sm font-medium">{msg}</p> : null;
