package de.fielanzen.offline;

import java.util.Calendar;
import java.util.TimeZone;

public final class BackupScheduleTest {
  private static long local(int year,int month,int day,int hour,int minute){
    Calendar c=Calendar.getInstance(); c.clear();c.set(year,month-1,day,hour,minute);return c.getTimeInMillis();
  }
  private static void equal(long expected,long actual,String label){
    if(expected!=actual)throw new AssertionError(label+" expected="+expected+" actual="+actual);
  }
  public static void main(String[] args) {
    TimeZone.setDefault(TimeZone.getTimeZone("Europe/Berlin"));
    long afterNoon=local(2026,11,22,15,10);
    equal(local(2026,11,23,3,0),BackupSchedule.firstDue(afterNoon,"03:00"),"tomorrow 03:00");
    equal(local(2026,11,22,16,0),BackupSchedule.firstDue(afterNoon,"16:00"),"today 16:00");
    long day=local(2026,11,23,3,0);
    equal(local(2026,11,24,3,0),BackupSchedule.followingDue(day,day,"daily","03:00",23),"daily");
    equal(local(2026,11,30,3,0),BackupSchedule.followingDue(day,day,"weekly","03:00",23),"weekly");
    long jan31=local(2027,1,31,3,0);
    long feb28=BackupSchedule.followingDue(jan31,jan31,"monthly","03:00",31);
    equal(local(2027,2,28,3,0),feb28,"month end clamp");
    equal(local(2027,3,31,3,0),BackupSchedule.followingDue(feb28,feb28,"monthly","03:00",31),"month end recover");
    long leapJan=local(2028,1,31,3,0);
    equal(local(2028,2,29,3,0),BackupSchedule.followingDue(leapJan,leapJan,"monthly","03:00",31),"leap year");
    long beforeDst=local(2027,3,27,3,0);
    equal(local(2027,3,28,3,0),BackupSchedule.followingDue(beforeDst,beforeDst,"daily","03:00",27),"spring daylight saving");
    long missed=local(2026,11,26,9,0);
    equal(local(2026,11,27,3,0),BackupSchedule.followingDue(day,missed,"daily","03:00",23),"catch up after missed days");
    boolean rejected=false;
    try{BackupSchedule.firstDue(day,"29:88");}catch(IllegalArgumentException ex){rejected=true;}
    if(!rejected)throw new AssertionError("invalid time accepted");
    System.out.println("10 Java schedule assertions passed");
  }
}
