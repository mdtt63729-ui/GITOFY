import React from 'react';
export interface M3CircularProgressProps { value?:number; determinate?:boolean; size?:number; strokeWidth?:number; showTrack?:boolean; className?:string; color?:string; }
export const M3CircularProgress:React.FC<M3CircularProgressProps>=({value,determinate=false,className=''})=><md-circular-progress indeterminate={!determinate} value={Math.max(0,Math.min(1,(value??0)/100))} className={className}/>;
