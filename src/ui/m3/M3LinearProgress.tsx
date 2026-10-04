import React from 'react';
export interface M3LinearProgressProps { determinate?:boolean; value?:number; height?:number; color?:string; trackColor?:string; className?:string; }
export const M3LinearProgress:React.FC<M3LinearProgressProps>=({determinate=false,value=0,className=''})=><md-linear-progress four-color={false} indeterminate={!determinate} value={Math.max(0,Math.min(1,value/100))} className={className}/>;
