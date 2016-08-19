/**
 * Given a payload generator, these helpers will return a ThunkAction
 * that will emit various actions along the generator's runtime.
 *
 * - FOOBAR_REQUEST is dispatched before an async payload generator is called.
 * - FOOBAR_SUCCESS is dispatched with the resulting payload if the generator
 *                  completes successfully.
 * - FOOBAR_FAILURE is dispatched with an error payload if the generator fails.
 *
 * Actions conform to the Flux Standard Action interface.
 * See https://github.com/acdlite/flux-standard-action
 *
 * @flow
 */

/**
 * The three types of Flux Standard Actions that are emitted by the
 * action creators below. The RequestAction is not part of the Flux
 * Standard Action "spec", but it's useful for async payload generators.
 */
export type RequestAction<T, I> = {
  type: T;
  input: I;
  requested: true;
  error?: false;
};

export type SuccessAction<T, I, P> = {
  type: T;
  input: I;
  payload: P;
  // The Flux Standard Action interface does not require this, but it
  // helps Flow figure out the type union better.
  error?: false;
};

export type ErrorAction<T, I> = {
  type: T;
  input: I;
  payload: Error;
  error: true;
};

export type Action<T, I, P> =
    RequestAction<T, I>
  | SuccessAction<T, I, P>
  | ErrorAction<T, I>
  ;

/**
 * Action where the input is simply passed on as the payload,
 * synchronously.
 */
export type SimpleAction<T, P> = SuccessAction<T, P, P>;

/**
 * This action is emitted by Flux itself upon startup.
 */
export type InitAction = { type: '@@redux/INIT' };

/**
 * ThunkActions are functions, as opposed to regular actions which are
 * objects. When called, a dispatch function is passed, which allows
 * the ThunkAction to dispatch zero, one, or multiple individual
 * actions to the store.
 */
export type Dispatch<A> = (action: A) => any;
export type GetState<S> = () => S;
export type ThunkAction<S, T, I, P> = (
  dispatch: Dispatch<Action<T, I, P>>,
  getState: GetState<S>
) => P | Promise<P>;

/**
 * Makes a ThunkAction that dispatches a payload as an action.
 *
 * Example:
 *
 * const changeUsername = actionFromPayload('CHANGE_USERNAME');
 * changeUsername.
 */
export function actionFromPayload<S, T, P>(
  type: T,
  ...rest: Array<void>
): ((payload: P) => ThunkAction<S, T, P, P>) {
  return (payload: P) => (dispatch: Dispatch<SimpleAction<T, P>>) => {
    dispatch({type, input: payload, payload});
    return payload;
  };
}

/**
 * Wraps a synchronous payload generator to return a ThunkAction that
 * emits Flux Standard Actions.
 */
export function actionFromPayloadGen<S, T, I, P>(
  type: T,
  createPayload: (state: S, input: I) => P,
  ...rest: Array<void>
): ((input: I) => ThunkAction<S, T, I, P>) {
  return (input: I) => (dispatch: Dispatch<Action<T, I, P>>, getState: () => S) => {
    let payload;
    try {
      payload = createPayload(getState(), input);
    } catch (ex) {
      const error: Error = ex; // because Flow
      dispatch({type, input, payload: error, error: true});
      throw ex;
    }
    dispatch({type, input, payload});
    return payload;
  };
}

/**
 * Wraps an asynchronous payload generator to return a ThunkAction
 * that emits Flux Standard Actions.
 */
export function actionFromAsyncPayloadGen<S, T, I, P>(
  type: T,
  genPayload: (state: S, input: I) => Promise<P>,
  ...rest: Array<void>
): ((input: I) => ThunkAction<S, T, I, P>) {
  return (input: I) => (dispatch: Dispatch<Action<T, I, P>>, getState: () => S) => {
    dispatch({type, input, requested: true});
    return genPayload(getState(), input).then(
      (payload: P) => {
        process.nextTick(() => dispatch({type, input, payload}));
        return payload;
      },
      (error: Error) => {
        process.nextTick(() => dispatch({
          type,
          input,
          payload: error,
          error: true,
        }));
        throw error;
      }
    );
  };
}
