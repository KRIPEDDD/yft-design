/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { once } from 'lodash-es'

/**
 * 检查给定对象是否是可迭代的。
 * @param thing - 要检查的对象。
 * @returns 如果给定对象是可迭代的，则返回 true，否则返回 false。
 */
function isIterable<T = any>(thing: any): thing is Iterable<T> {
  return thing && typeof thing === 'object' && typeof thing[Symbol.iterator] === 'function'
}

/**
 * 多重释放错误
 */
export class MultiDisposeError extends Error {
  constructor(public readonly errors: any[]) {
    super(`Encountered errors while disposing of store. Errors: [${errors.join(', ')}]`)
  }
}

/**
 * 可释放接口
 */
export interface IDisposable {
  dispose(): void
}

/**
 * 检查给定对象是否实现了 IDisposable 接口。
 * @param thing - 要检查的对象。
 * @returns 如果给定对象实现了 IDisposable 接口，则返回 true，否则返回 false。
 */
export function isDisposable<E extends object>(thing: E): thing is E & IDisposable {
  return (
    typeof (<IDisposable>thing).dispose === 'function' && (<IDisposable>thing).dispose.length === 0
  )
}

/**
 * Disposes of the value(s) passed in.
 * 清除传递的值。
 */
export function dispose<T extends IDisposable>(disposable: T): T
export function dispose<T extends IDisposable>(disposable: T | undefined): T | undefined
export function dispose<T extends IDisposable, A extends Iterable<T> = Iterable<T>>(disposables: A,): A
export function dispose<T extends IDisposable>(disposables: Array<T>): Array<T>
export function dispose<T extends IDisposable>(disposables: ReadonlyArray<T>): ReadonlyArray<T>
export function dispose<T extends IDisposable>(arg: T | Iterable<T> | undefined): any {
  if (isIterable(arg)) {
    const errors: any[] = []

    for (const d of arg) {
      if (d) {
        try {
          d.dispose()
        } catch (e) {
          errors.push(e)
        }
      }
    }

    if (errors.length === 1) {
      throw errors[0]
    } else if (errors.length > 1) {
      throw new MultiDisposeError(errors)
    }

    return Array.isArray(arg) ? [] : arg
  } else if (arg) {
    arg.dispose()
    return arg
  }
}

export class DisposableStore implements IDisposable {
  static DISABLE_DISPOSED_WARNING = false

  private readonly _toDispose = new Set<IDisposable>()
  private _isDisposed = false

  /**
   * Dispose of all registered disposables and mark this object as disposed.
	 * 清除所有已注册的可释放对象，并标记此对象为已释放。
   *
   * Any future disposables added to this object will be disposed of on `add`.
	 * 之后添加到此对象的任何可释放对象都将在 `add` 时被释放。
   */
  public dispose(): void {
    if (this._isDisposed) {
      return
    }

    this._isDisposed = true
    this.clear()
  }

  /**
   * Returns `true` if this object has been disposed
	 * 返回 `true` 如果此对象已释放
   */
  public get isDisposed(): boolean {
    return this._isDisposed
  }

  /**
   * Dispose of all registered disposables but do not mark this object as disposed.
	 * 清除所有已注册的可释放对象，但不将此对象标记为已释放。
   */
  public clear(): void {
    if (this._toDispose.size === 0) {
      return
    }

    try {
      dispose(this._toDispose)
    } finally {
      this._toDispose.clear()
    }
  }

  public add<T extends IDisposable>(o: T): T {
    if (!o) {
      return o
    }
    if ((o as unknown as DisposableStore) === this) {
      throw new Error('Cannot register a disposable on itself!')
    }

    if (this._isDisposed) {
      if (!DisposableStore.DISABLE_DISPOSED_WARNING) {
        console.warn(
          new Error(
            'Trying to add a disposable to a DisposableStore that has already been disposed of. The added object will be leaked!',
          ).stack,
        )
      }
    } else {
      this._toDispose.add(o)
    }

    return o
  }
}

export abstract class Disposable implements IDisposable {
  protected readonly _store = new DisposableStore()

  public dispose(): void {
    this._store.dispose()
  }

  protected _register<T extends IDisposable>(o: T): T {
    if ((o as unknown as Disposable) === this) {
      throw new Error('Cannot register a disposable on itself!')
    }
    return this._store.add(o)
  }
}

/**
 * Turn a function that implements dispose into an {@link IDisposable}.
 * 将实现 dispose 的函数转换为 {@link IDisposable}。
 */
export function toDisposable(fn: () => void): IDisposable {
  const self = {
    dispose: once(() => {
      fn()
    }),
  }
  return self
}
