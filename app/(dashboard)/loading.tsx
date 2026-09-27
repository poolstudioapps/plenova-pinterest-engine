/**
 * What a page looks like while its data is on the way.
 *
 * Every page here reads the database before it can show anything; without
 * this, a click on the sidebar left the old page on screen, apparently
 * ignored, until the new one was ready. Now the new page's shape appears at
 * once - a title, a toolbar, cards - with a light passing over it, and the
 * real content cascades in over it when it arrives (see .rise-in).
 */
export default function Loading() {
  return (
    <>
      <p role="status" className="sr-only">
        Chargement…
      </p>
      <div className="mb-7 md:mb-8" aria-hidden>
        <div className="skeleton h-[34px] w-[min(260px,70%)] rounded-[10px] md:h-[40px]" />
        <div className="skeleton mt-3.5 h-[14px] w-[min(520px,90%)] rounded-full" />
        <div className="skeleton mt-2 h-[14px] w-[min(380px,65%)] rounded-full" />
      </div>
      <div className="mb-5 flex gap-2.5">
        <div className="skeleton h-[42px] w-[190px] rounded-full" />
        <div className="skeleton h-[42px] w-[150px] rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {[0, 1].map((card) => (
          <div key={card} className="card p-5">
            <div className="flex items-center gap-2.5">
              <div className="skeleton size-8 rounded-[10px]" />
              <div className="skeleton h-[16px] w-[120px] rounded-full" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((tile) => (
                <div key={tile} className="skeleton h-[74px] rounded-[14px]" />
              ))}
            </div>
            <div className="skeleton mt-5 h-[12px] w-[70%] rounded-full" />
          </div>
        ))}
      </div>
    </>
  );
}
