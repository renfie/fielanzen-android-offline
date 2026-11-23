package de.fielanzen.offline;

import java.util.Calendar;

/** Pure Java calendar arithmetic, testable without Android SDK. All times are local device time. */
public final class BackupSchedule {
    private BackupSchedule() {}
    private static void atHour(Calendar calendar, String time) {
        if (time == null || !time.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]"))
            throw new IllegalArgumentException("Ungueltige lokale Backup-Uhrzeit");
        calendar.set(Calendar.HOUR_OF_DAY, Integer.parseInt(time.substring(0,2)));
        calendar.set(Calendar.MINUTE, Integer.parseInt(time.substring(3,5)));
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
    }
    public static long firstDue(long now, String time) {
        Calendar calendar=Calendar.getInstance();calendar.setTimeInMillis(now);atHour(calendar,time);
        if (calendar.getTimeInMillis()<=now)calendar.add(Calendar.DAY_OF_YEAR, 1);
        return calendar.getTimeInMillis();
    }
    public static int anchorDay(long due) {
        Calendar calendar=Calendar.getInstance();calendar.setTimeInMillis(due);
        return calendar.get(Calendar.DAY_OF_MONTH);
    }
    public static long followingDue(long target, long now, String frequency, String time, int monthlyAnchor) {
        Calendar calendar=Calendar.getInstance();calendar.setTimeInMillis(target);
        do {
            switch (frequency) {
                case "daily": calendar.add(Calendar.DAY_OF_YEAR, 1); break;
                case "weekly": calendar.add(Calendar.DAY_OF_YEAR, 7); break;
                case "monthly":
                    calendar.set(Calendar.DAY_OF_MONTH,1);
                    calendar.add(Calendar.MONTH,1);
                    calendar.set(Calendar.DAY_OF_MONTH,Math.min(Math.max(1,monthlyAnchor), calendar.getActualMaximum(Calendar.DAY_OF_MONTH)));
                    break;
                default: throw new IllegalArgumentException("Unbekanntes Intervall");
            }
            atHour(calendar,time);
        } while(calendar.getTimeInMillis()<=now);
        return calendar.getTimeInMillis();
    }
}
