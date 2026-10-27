// A new page fades in when it replaces the previous one (unlike a layout, a
// template is mounted again on every navigation). Off with reduced motion.
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-enter motion-reduce:animate-none">{children}</div>;
}
