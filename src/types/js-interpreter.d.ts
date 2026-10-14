// Minimal typing for the parts of js-interpreter (Neil Fraser's JS-Interpreter) the platform uses.
declare module 'js-interpreter' {
  type PseudoObject = object;
  export default class Interpreter {
    constructor(code: string, init?: (interpreter: Interpreter, globalObject: PseudoObject) => void);
    /** Executes one step; returns false when the program has finished. */
    step(): boolean;
    /** Completion value of the last expression statement. */
    value: unknown;
    /** 0: regular expressions throw; 1: native; 2 (default): sandboxed via Web Workers or Node vm. */
    REGEXP_MODE: 0 | 1 | 2;
    setProperty(obj: PseudoObject, name: string, value: unknown): void;
  }
}
