import React from 'react';
export interface M3SwitchProps { checked:boolean; onChange:(checked:boolean)=>void; disabled?:boolean; showIcons?:boolean; className?:string; ariaLabel?:string; }
export const M3Switch:React.FC<M3SwitchProps>=({checked,onChange,disabled=false,className='',ariaLabel})=><md-switch selected={checked} disabled={disabled} aria-label={ariaLabel} onClick={()=>onChange(!checked)} className={className}/>;
