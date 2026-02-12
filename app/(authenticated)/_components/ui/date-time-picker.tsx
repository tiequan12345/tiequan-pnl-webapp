"use client";

import { CalendarIcon, Clock, MoveRight } from "lucide-react";
import React, { useRef, useState } from "react";
import {
    format,
    isValid,
    parse,
    setHours,
    setMinutes,
    isSameDay,
} from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/app/(authenticated)/_components/ui/button";
import { Calendar } from "@/app/(authenticated)/_components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/app/(authenticated)/_components/ui/popover";
import { ScrollArea } from "@/app/(authenticated)/_components/ui/scroll-area";

interface DateTimePickerProps {
    date: Date | undefined;
    setDate: (date: Date | undefined) => void;
    className?: string;
    placeholder?: string;
}

export function DateTimePicker({
    date,
    setDate,
    className,
    placeholder = "Pick a date",
}: DateTimePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [timeValue, setTimeValue] = useState<string>(
        date ? format(date, "HH:mm") : "12:00"
    );

    const handleDateSelect = (selectedDate: Date | undefined) => {
        if (selectedDate) {
            const [hours, minutes] = timeValue.split(":").map(Number);
            const newDate = setHours(setMinutes(selectedDate, minutes), hours);
            setDate(newDate);
        } else {
            setDate(undefined);
        }
    };

    const handleTimeChange = (type: "hour" | "minute", value: string) => {
        const [currentHours, currentMinutes] = timeValue.split(":").map(Number);
        let newHours = currentHours;
        let newMinutes = currentMinutes;

        if (type === "hour") {
            newHours = parseInt(value, 10);
        } else if (type === "minute") {
            newMinutes = parseInt(value, 10);
        }

        const newTimeValue = `${newHours.toString().padStart(2, "0")}:${newMinutes
            .toString()
            .padStart(2, "0")}`;
        setTimeValue(newTimeValue);

        if (date) {
            const newDate = setHours(setMinutes(date, newMinutes), newHours);
            setDate(newDate);
        }
    };

    // Generate hours and minutes for the scrollable lists
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const minutes = Array.from({ length: 60 }, (_, i) => i);

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant={"outline"}
                    className={cn(
                        "w-full justify-start text-left font-normal border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-900 transition-all duration-200",
                        !date && "text-muted-foreground",
                        className
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4 text-zinc-400" />
                    {date ? (
                        <span className="text-zinc-100 font-medium">
                            {format(date, "PPP p")}
                        </span>
                    ) : (
                        <span className="text-zinc-500">{placeholder}</span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-zinc-950 border-zinc-800 shadow-2xl rounded-xl overflow-hidden" align="start">
                <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-zinc-800">
                    <div className="p-3">
                        <div className="flex items-center justify-between px-2 pb-2 mb-2 border-b border-zinc-800/50">
                            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Date</span>
                        </div>
                        <Calendar
                            mode="single"
                            selected={date}
                            onSelect={handleDateSelect}
                            initialFocus
                            className="bg-transparent"
                            classNames={{
                                nav_button: "border border-zinc-800 hover:bg-zinc-900",
                                day_selected:
                                    "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 hover:text-zinc-900 focus:bg-zinc-100 focus:text-zinc-900",
                                day_today: "bg-zinc-800/50 text-zinc-100",
                            }}
                        />
                    </div>
                    <div className="p-3 w-full sm:w-auto min-w-[180px]">
                        <div className="flex items-center justify-between px-2 pb-2 mb-2 border-b border-zinc-800/50">
                            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Time</span>
                            <Clock className="w-3 h-3 text-zinc-500" />
                        </div>

                        <div className="flex h-[280px] gap-2">
                            {/* Hours */}
                            <ScrollArea className="h-full w-20 rounded-md border border-zinc-800 bg-zinc-900/30">
                                <div className="p-1 gap-1 flex flex-col">
                                    {hours.map((hour) => {
                                        const isSelected = date ? date.getHours() === hour : false;
                                        return (
                                            <button
                                                key={hour}
                                                className={cn(
                                                    "w-full text-center text-sm py-1.5 rounded hover:bg-zinc-800 transition-colors",
                                                    isSelected && "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 font-medium",
                                                    !isSelected && "text-zinc-400"
                                                )}
                                                onClick={() => handleTimeChange("hour", hour.toString())}
                                            >
                                                {hour.toString().padStart(2, "0")}
                                            </button>
                                        )
                                    })}
                                </div>
                            </ScrollArea>

                            {/* Separator */}
                            <div className="flex items-center justify-center text-zinc-600 font-bold">:</div>

                            {/* Minutes */}
                            <ScrollArea className="h-full w-20 rounded-md border border-zinc-800 bg-zinc-900/30">
                                <div className="p-1 gap-1 flex flex-col">
                                    {minutes.map((minute) => {
                                        const isSelected = date ? date.getMinutes() === minute : false;
                                        return (
                                            <button
                                                key={minute}
                                                className={cn(
                                                    "w-full text-center text-sm py-1.5 rounded hover:bg-zinc-800 transition-colors",
                                                    isSelected && "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 font-medium",
                                                    !isSelected && "text-zinc-400"
                                                )}
                                                onClick={() => handleTimeChange("minute", minute.toString())}
                                            >
                                                {minute.toString().padStart(2, "0")}
                                            </button>
                                        )
                                    })}
                                </div>
                            </ScrollArea>
                        </div>

                        <div className="mt-3 pt-3 border-t border-zinc-800">
                            <div className="text-center text-xs text-zinc-500">
                                {date ? format(date, "PPP p") : "No date selected"}
                            </div>
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
