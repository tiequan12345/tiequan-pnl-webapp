"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/app/(authenticated)/_components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    ...props
}: CalendarProps) {
    return (
        <DayPicker
            showOutsideDays={showOutsideDays}
            className={cn("p-3", className)}
            classNames={{
                months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                month: "space-y-4",
                caption: "flex justify-center pt-1 relative items-center",
                caption_label: "text-sm font-medium text-zinc-100",
                nav: "space-x-1 flex items-center",
                nav_button: cn(
                    buttonVariants({ variant: "outline" }),
                    "h-7 w-7 bg-zinc-900 border-zinc-800 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50"
                ),
                nav_button_previous: "absolute left-1",
                nav_button_next: "absolute right-1",
                table: "w-full border-collapse space-y-1",
                head_row: "grid grid-cols-7 w-full",
                head_cell:
                    "text-zinc-400 rounded-md font-normal text-[0.8rem] flex justify-center items-center",
                row: "grid grid-cols-7 w-full mt-2",
                cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-zinc-800 [&:has([aria-selected].day-outside)]:bg-zinc-800/50 [&:has([aria-selected].day-range-end)]:rounded-r-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
                day: cn(
                    buttonVariants({ variant: "ghost" }),
                    "h-9 w-9 p-0 font-normal aria-selected:opacity-100 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50 mx-auto"
                ),
                day_range_end: "day-range-end",
                day_selected:
                    "bg-zinc-100 text-zinc-900 hover:bg-zinc-100 hover:text-zinc-900 focus:bg-zinc-100 focus:text-zinc-900",
                day_today: "bg-zinc-800 text-zinc-50",
                day_outside:
                    "day-outside text-zinc-500 opacity-50 aria-selected:bg-zinc-800/50 aria-selected:text-zinc-500 aria-selected:opacity-30",
                day_disabled: "text-zinc-600 opacity-50",
                day_range_middle:
                    "aria-selected:bg-zinc-800 aria-selected:text-zinc-100",
                day_hidden: "invisible",
                ...classNames,
            }}
            components={{
                IconLeft: ({ ...props }) => <ChevronLeft className="h-4 w-4 text-zinc-100" />,
                IconRight: ({ ...props }) => <ChevronRight className="h-4 w-4 text-zinc-100" />,
            }}
            {...props}
        />
    )
}
Calendar.displayName = "Calendar"

export { Calendar }
