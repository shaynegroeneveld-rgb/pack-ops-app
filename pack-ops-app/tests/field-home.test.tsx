import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
const state=vi.hoisted(()=>({start:vi.fn().mockResolvedValue(undefined),route:vi.fn()}));
vi.mock('@/app/contexts/auth-context',()=>({useAuthContext:()=>({currentUser:{user:{id:'worker',fullName:'Worker',role:'field'}}})}));
vi.mock('@/app/store/ui-store',()=>({useUiStore:(select:any)=>select({setActiveRoute:state.route})}));
vi.mock('@/features/workbench/hooks/use-workbench-slice',()=>({useWorkbenchSlice:()=>({jobsQuery:{data:[{job:{id:'one',number:'26184',title:'Lake Cabin',status:'in_progress',city:'Vernon'},contactName:'Smith',neededMaterialsCount:2},{job:{id:'two',number:'26185',title:'Shop wiring',status:'in_progress'},contactName:'Jones',neededMaterialsCount:0}]},contactsQuery:{data:[]},assignableUsersQuery:{data:[]},activeRunningTimerDraft:null,timeEntryDraft:null,startTimer:state.start})}));
import {FieldModePage} from '@/features/field/components/FieldModePage';
beforeEach(()=>{vi.clearAllMocks();});
it('shows jobs immediately and filters multiword searches without a submit step',()=>{
 render(<FieldModePage/>);
 expect(screen.getByAltText('Pack Electric')).toBeTruthy();expect(screen.getByText('Lake Cabin')).toBeTruthy();expect(screen.queryByText(/Work Scheduled/)).toBeNull();
 fireEvent.change(screen.getByRole('searchbox',{name:'Find a job'}),{target:{value:'Smith 26184'}});
 expect(screen.getByText('Lake Cabin')).toBeTruthy();expect(screen.queryByText('Shop wiring')).toBeNull();
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'no match'}});expect(screen.getByText(/No matching jobs/)).toBeTruthy();
});
it('starts directly from the job card and blocks repeated timer taps',async()=>{
 let finish!:()=>void;state.start.mockImplementationOnce(()=>new Promise<void>(resolve=>finish=resolve));render(<FieldModePage/>);
 const buttons=screen.getAllByRole('button',{name:/Start timer/});fireEvent.click(buttons[0]);fireEvent.click(buttons[1]);
 expect(state.start).toHaveBeenCalledTimes(1);expect(state.start).toHaveBeenCalledWith('one');finish();
 await waitFor(()=>expect((buttons[1] as HTMLButtonElement).disabled).toBe(false));
});
