import { LoginForm } from "@/components/console/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center shell-bg p-[18px]">
      <div className="w-full max-w-[380px] rounded-[22px] border border-edge-mid panel-bg p-[22px]">
        <div className="flex items-center gap-[11px]">
          <span className="flex h-[44px] w-[44px] items-center justify-center rounded-[14px] gold-bg font-serif text-[23px] text-[#1a1512]">
            F
          </span>
          <span>
            <span className="block font-serif text-[24px] leading-none">FETS Console</span>
            <span className="block font-mono text-[10.5px] text-fg-dim">Exam delivery · Site 4960</span>
          </span>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
