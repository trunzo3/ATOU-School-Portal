import type { ComponentPropsWithoutRef } from "react"
import atouAnniversaryLogo from "@assets/ATOU_30th_Anniversary_Logo_1787159655200.png"
import { cn } from "@/lib/utils"

type AtouLogoProps = Omit<ComponentPropsWithoutRef<"img">, "src" | "alt">

export function AtouLogo({ className, ...props }: AtouLogoProps) {
  return (
    <img
      src={atouAnniversaryLogo}
      alt="A Touch of Understanding 30th Anniversary"
      className={cn("h-auto w-auto object-contain", className)}
      {...props}
    />
  )
}