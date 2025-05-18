import { wrappedReturnsInferredSomeComplexType } from "ref";

export const returnValue: ReturnType<
  typeof wrappedReturnsInferredSomeComplexType
> = wrappedReturnsInferredSomeComplexType();
