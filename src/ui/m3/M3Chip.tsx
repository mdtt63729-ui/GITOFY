import React from 'react';
export interface M3ChipProps { label:string; selected?:boolean; onClick?:()=>void; icon?:React.ReactNode; showCheckmark?:boolean; className?:string; count?:number; }
export const M3Chip:React.FC<M3ChipProps>=({label,selected=false,onClick,icon,count})=><md-filter-chip selected={selected} onClick={onClick} className={className} label={count===undefined?label:`${label} · ${count}`}>{icon}</md-filter-chip>;
