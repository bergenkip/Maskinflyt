"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormAlert, SubmitButton } from "@/components/form";
import type { NoticeKind } from "@/lib/email/planned-email";
import { tellCustomer, type NoticeState } from "../notice-actions";

// The one tap that e-mails the customer the news about their job (stage 16c).
export function NoticeForm({ job, kind }: { job: string; kind: NoticeKind }) {
  const t = useTranslations("Jobs");
  const [state, action] = useActionState<NoticeState, FormData>(tellCustomer, {});
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="job" value={job} />
      {state.result === "failed" && <FormAlert kind="error">{t("noticeFailed")}</FormAlert>}
      <div>
        <SubmitButton pendingLabel={t("noticeSending")}>{t(`noticeSend.${kind}`)}</SubmitButton>
      </div>
    </form>
  );
}
