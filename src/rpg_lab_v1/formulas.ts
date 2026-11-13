/** Safe arithmetic expression evaluator for project-defined RPG formulas.
 * No JS execution, property traversal, functions supplied by users, or side effects.
 */
export type LabVariables=Record<string,number>;
export type LabFormulaRegistry=Record<string,string>;
const NAME=/^[A-Za-z_][A-Za-z0-9_.]{0,63}$/;
const KNOWN_FUNCS=new Set(["min","max","abs","round","floor","ceil","sqrt","clamp"]);
const operatorPower:Record<string,number>={"+":1,"-":1,"*":2,"/":2,"^":3};
const MIN=-1e12,MAX=1e12;
const finite=(n:number):number=>{
 if(!Number.isFinite(n)||n<MIN||n>MAX)throw Error("LAB_FORMULA_NONFINITE_OR_OUT_OF_RANGE");
 return n;
};
export function validateFormulaRegistry(formulas:LabFormulaRegistry):void{
 if(!formulas||typeof formulas!=="object"||Array.isArray(formulas)||Object.keys(formulas).length>128)throw Error("LAB_FORMULAS_INVALID");
 for(const [id,expression] of Object.entries(formulas)){
  if(!NAME.test(id)||KNOWN_FUNCS.has(id)||typeof expression!=="string"||expression.length<1||expression.length>512)throw Error("LAB_FORMULA_INVALID_ENTRY");
 }
}
function tokenize(text:string):string[]{
 if(text.length>512)throw Error("LAB_FORMULA_TOO_LONG");
 const tokens:string[]=[];const regex=/\s*(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z0-9_.]*|[()+*/^,-])/y;
 let offset=0;
 while(offset<text.length){
  if(/^\s*$/.test(text.slice(offset)))break;
  regex.lastIndex=offset;const match=regex.exec(text);
  if(!match)throw Error("LAB_FORMULA_BAD_TOKEN");
  tokens.push(match[1]);offset=regex.lastIndex;
  if(tokens.length>256)throw Error("LAB_FORMULA_TOO_COMPLEX");
 }
 return tokens;
}
export function evaluateFormula(expression:string,variables:LabVariables,formulas:LabFormulaRegistry={},activeIds:string[]=[]):number{
 validateFormulaRegistry(formulas);
 if(!variables||typeof variables!=="object"||Array.isArray(variables)||Object.keys(variables).length>128)throw Error("LAB_VARIABLES_INVALID");
 for(const [key,value] of Object.entries(variables))
  if(!NAME.test(key)||typeof value!=="number")throw Error("LAB_VARIABLE_INVALID");
 const tokens=tokenize(expression);let position=0,steps=0;
 const peek=()=>tokens[position];
 const take=()=>tokens[position++];
 const resolveName=(key:string):number=>{
  if(Object.prototype.hasOwnProperty.call(variables,key))return finite(variables[key]);
  if(Object.prototype.hasOwnProperty.call(formulas,key)){
   if(activeIds.includes(key)||activeIds.length>=16)throw Error("LAB_FORMULA_CYCLE");
   return evaluateFormula(formulas[key],variables,formulas,[...activeIds,key]);
  }
  throw Error("LAB_FORMULA_UNKNOWN_VARIABLE:"+key);
 };
 const func=(name:string,args:number[]):number=>{
  if(!KNOWN_FUNCS.has(name))throw Error("LAB_FORMULA_UNKNOWN_FUNCTION");
  if(name==="min"||name==="max"){
   if(args.length<1||args.length>8)throw Error("LAB_FORMULA_BAD_ARGS");
   return finite(name==="min"?Math.min(...args):Math.max(...args));
  }
  if((name==="clamp"&&args.length!==3)||(name!=="clamp"&&args.length!==1))throw Error("LAB_FORMULA_BAD_ARGS");
  const x=args[0];
  if(name==="abs")return finite(Math.abs(x));
  if(name==="round")return finite(Math.round(x));
  if(name==="floor")return finite(Math.floor(x));
  if(name==="ceil")return finite(Math.ceil(x));
  if(name==="sqrt")return finite(Math.sqrt(x));
  if(args[1]>args[2])throw Error("LAB_FORMULA_BAD_CLAMP");
  return finite(Math.max(args[1],Math.min(args[2],x)));
 };
 const primary=(depth:number):number=>{
  if(++steps>256||depth>32)throw Error("LAB_FORMULA_TOO_COMPLEX");
  const t=take();
  if(t===undefined)throw Error("LAB_FORMULA_UNEXPECTED_END");
  if(t==="-")return finite(-primary(depth+1));
  if(t==="+")return primary(depth+1);
  if(t==="("){
   const value=expr(0,depth+1);if(take()!==")")throw Error("LAB_FORMULA_MISSING_CLOSE");
   return value;
  }
  if(/^\d/.test(t))return finite(Number(t));
  if(NAME.test(t)){
   if(peek()==="("){
    take();const args:number[]=[];
    if(peek()!==")")while(true){
     args.push(expr(0,depth+1));
     if(peek()!==",")break;
     take();if(args.length>8)throw Error("LAB_FORMULA_BAD_ARGS");
    }
    if(take()!==")")throw Error("LAB_FORMULA_MISSING_CLOSE");
    return func(t,args);
   }
   return resolveName(t);
  }
  throw Error("LAB_FORMULA_EXPECTED_VALUE");
 };
 const expr=(minPower:number,depth:number):number=>{
  let left=primary(depth);
  while(peek()!==undefined&&Object.prototype.hasOwnProperty.call(operatorPower,peek())){
   const op=peek(),power=operatorPower[op];
   if(power<minPower)break;
   take();
   const right=expr(power+(op==="^"?0:1),depth+1);
   if(op==="+")left=finite(left+right);
   if(op==="-")left=finite(left-right);
   if(op==="*")left=finite(left*right);
   if(op==="/"){if(right===0)throw Error("LAB_FORMULA_DIVIDE_BY_ZERO");left=finite(left/right);}
   if(op==="^"){if(Math.abs(right)>12)throw Error("LAB_FORMULA_EXPONENT_LIMIT");left=finite(Math.pow(left,right));}
  }
  return left;
 };
 const result=expr(0,0);
 if(position!==tokens.length)throw Error("LAB_FORMULA_TRAILING_TOKENS");
 return finite(result);
}
