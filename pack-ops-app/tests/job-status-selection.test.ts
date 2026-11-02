import {expect,it} from 'vitest';
import {JOB_STATUSES} from '@/domain/enums';
import {getAllowedNextJobStatuses,getSelectableJobStatuses} from '@/domain/jobs/status';
it('offers every job status directly, including corrections from closed and cancelled',()=>{
 for(const status of JOB_STATUSES){
  expect(new Set(getSelectableJobStatuses(status))).toEqual(new Set(JOB_STATUSES));
  expect(getAllowedNextJobStatuses(status)).toHaveLength(JOB_STATUSES.length-1);
  expect(getAllowedNextJobStatuses(status)).not.toContain(status);
 }
});
