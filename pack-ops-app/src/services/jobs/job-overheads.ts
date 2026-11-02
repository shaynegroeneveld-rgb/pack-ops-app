export const WORK_ORIGIN='4320 Hales Rd, Spallumcheen, BC V4Y 0N6, Canada';
export interface OverheadSettings {round_trip_km:number|null;rate_per_km:number;trip_adjustment:number;origin_address:string;destination_address:string}
export interface AdminEntry {id:string;work_date:string;hours:number;hourly_cost:number;note:string}
export function calculateOverheads(input:{days:string[];settings:OverheadSettings|null;address:string;admin:AdminEntry[];recordedMileage:number;hasRecordedMileage:boolean;cutoff?:string}){
 const days=[...new Set(input.days.filter(day=>!input.cutoff||day<=input.cutoff))].sort();
 const settings=input.settings;
 const trips=Math.max(0,days.length+(settings?.trip_adjustment??0));
 const distanceCurrent=!!settings&&settings.destination_address===input.address&&settings.origin_address===WORK_ORIGIN;
 const distance=distanceCurrent?settings!.round_trip_km:null;
 const estimatedMileage=distance===null?null:Math.round(trips*distance*(settings?.rate_per_km??0.75)*100)/100;
 const adminCost=Math.round(input.admin.filter(e=>!input.cutoff||e.work_date<=input.cutoff).reduce((sum,e)=>sum+e.hours*e.hourly_cost,0)*100)/100;
 return {days,trips,adminCost,estimatedMileage,additionalMileage:input.hasRecordedMileage?0:estimatedMileage,distanceCurrent};
}
