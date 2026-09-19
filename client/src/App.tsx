import MapView from './MapView'

export default function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Relay</h1>
        <p className="app__tagline">Live food rescue board — Baltimore</p>
      </header>
      <main className="app__map">
        <MapView />
      </main>
    </div>
  )
}
