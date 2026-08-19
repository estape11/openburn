// Minimal typings for `svgpath` (CJS, no upstream types). Only what we use.
declare module 'svgpath' {
  namespace svgpath {
    interface SvgPath {
      /** Parse error message; empty string when the path parsed cleanly. */
      err: string;
      abs(): SvgPath;
      unshort(): SvgPath;
      unarc(): SvgPath;
      /** Applies an SVG transform attribute string (matrix/translate/scale/rotate/skew list). */
      transform(transformString: string): SvgPath;
      /** Visits absolute segments after .abs(): ['M',x,y] | ['L',x,y] | ['H',x] | ['V',y]
       * | ['C',x1,y1,x2,y2,x,y] | ['Q',x1,y1,x,y] | ['Z']. (x,y) is the current point
       * BEFORE the segment. */
      iterate(
        visitor: (segment: (string | number)[], index: number, x: number, y: number) => void,
      ): SvgPath;
      toString(): string;
    }
  }
  function svgpath(d: string): svgpath.SvgPath;
  export = svgpath;
}
